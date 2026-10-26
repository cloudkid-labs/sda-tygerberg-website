import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { handleInboxList, handleInboxMessage, handleInboxReply } from '../src/worker/inbox.ts';
import { signSession } from '../src/worker/auth.ts';

/*
 * /api/mail/inbox, /message and /reply: session-gated reads and replies over
 * the SUBMISSIONS bucket. Fixture style follows test/contact.test.mjs.
 */

const SECRET = 'test-session-secret';

function r2(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    bucket: {
      async put(key, value) {
        store.set(key, typeof value === 'string' ? value : String(value));
      },
      async get(key) {
        const value = store.get(key);
        if (value === undefined) return null;
        return { async json() { return JSON.parse(value); } };
      },
      async list({ prefix = '', limit = 1000 } = {}) {
        return {
          objects: [...store.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((key) => ({ key })),
          truncated: false,
        };
      },
    },
  };
}

const item = (over = {}) => ({
  id: 'abc-1',
  submittedAt: '2026-10-25T10:00:00.000Z',
  topic: 'connect',
  name: 'Jan',
  email: 'jan@example.co.za',
  phone: null,
  lang: 'af',
  message: 'Hallo',
  replies: [],
  ...over,
});

const key = 'submissions/2026/10/25/2026-10-25T10:00:00.000Z-abc-1.json';

const env = (bucket, over = {}) => ({
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: 'boss@example.co.za',
  BREVO_API_KEY: 'test-brevo-key',
  MAIL_SEND_FROM: 'welkom@sdatygerberg.co.za,klerk@sdatygerberg.co.za,tesourier@sdatygerberg.co.za,kerk@sdatygerberg.co.za',
  SUBMISSIONS: bucket,
  ...over,
});

const get = (path, session) =>
  new Request(`https://x${path}`, {
    headers: session ? { cookie: `__Host-kerkraad=${session}` } : {},
  });

const post = (payload, session) =>
  new Request('https://x/api/mail/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://x',
      ...(session ? { cookie: `__Host-kerkraad=${session}` } : {}),
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
let brevoCalls;

function mockBrevo({ ok = true } = {}) {
  brevoCalls = [];
  globalThis.fetch = async (url, init) => {
    brevoCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}', { status: ok ? 201 : 500 });
  };
}

beforeEach(() => {
  console.log = () => {};
  console.error = () => {};
});

afterEach(() => {
  console.log = realLog;
  console.error = realError;
  globalThis.fetch = realFetch;
});

describe('handleInboxList', () => {
  test('401 without a session, 503 without the bucket', async () => {
    assert.equal((await handleInboxList(get('/api/mail/inbox'), env(r2().bucket))).status, 401);
    const session = await signSession('boss@example.co.za', SECRET);
    const noBucket = await handleInboxList(get('/api/mail/inbox', session), env(undefined));
    assert.equal(noBucket.status, 503);
  });

  test('newest first, message omitted from summaries', async () => {
    const { bucket } = r2({
      'submissions/2026/10/24/2026-10-24T10:00:00.000Z-old.json': JSON.stringify(item({ id: 'old', submittedAt: '2026-10-24T10:00:00.000Z' })),
      [key]: JSON.stringify(item()),
    });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxList(get('/api/mail/inbox', session), env(bucket));
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.deepEqual(items.map((i) => i.id), ['abc-1', 'old']);
    assert.ok(!('message' in items[0]));
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
  });
});

describe('handleInboxMessage', () => {
  test('404 on unknown id, 400 on path traversal', async () => {
    const session = await signSession('boss@example.co.za', SECRET);
    const e = env(r2().bucket);
    assert.equal((await handleInboxMessage(get('/api/mail/message?id=nope', session), e)).status, 404);
    assert.equal((await handleInboxMessage(get('/api/mail/message?id=../x', session), e)).status, 400);
  });

  test('returns the full thread', async () => {
    const { bucket } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxMessage(get('/api/mail/message?id=abc-1', session), env(bucket));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).item.message, 'Hallo');
  });
});

describe('handleInboxReply', () => {
  test('rejects non-POST, and 401 without a session', async () => {
    const e = env(r2().bucket);
    assert.equal((await handleInboxReply(new Request('https://x/api/mail/reply'), e)).status, 405);
    assert.equal((await handleInboxReply(post({ id: 'abc-1', body: 'Hi' }), e)).status, 401);
  });

  test('sends from the role address and appends the reply to the thread', async () => {
    mockBrevo();
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxReply(post({ id: 'abc-1', body: 'Dankie vir jou boodskap.' }, session), env(bucket));
    assert.equal(res.status, 200);
    assert.equal(brevoCalls[0].body.sender.email, 'welkom@sdatygerberg.co.za');
    assert.deepEqual(brevoCalls[0].body.to, [{ email: 'jan@example.co.za' }]);
    const updated = JSON.parse(store.get(key));
    assert.equal(updated.replies.length, 1);
    assert.equal(updated.replies[0].by, 'boss@example.co.za');
  });

  test('Brevo failure becomes send-error without touching the thread', async () => {
    mockBrevo({ ok: false });
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxReply(post({ id: 'abc-1', body: 'Hi' }, session), env(bucket));
    assert.equal(res.status, 502);
    assert.equal(JSON.parse(store.get(key)).replies.length, 0);
  });

  test('400 when the visitor left no email address', async () => {
    mockBrevo();
    const { bucket } = r2({ [key]: JSON.stringify(item({ email: null })) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxReply(post({ id: 'abc-1', body: 'Hi' }, session), env(bucket));
    assert.equal(res.status, 400);
    assert.equal(brevoCalls.length, 0);
  });
});
