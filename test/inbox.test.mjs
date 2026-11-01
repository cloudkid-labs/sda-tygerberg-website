import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { handleInboxList, handleInboxMessage, handleInboxReply, handleInboxDelete, handleInboxTrash, handleInboxSent, fileInboundAnswer, stripQuoted } from '../src/worker/inbox.ts';
import { isUnread, awaitingAnswer } from '../src/lib/mailUnread.ts';import { signSession } from '../src/worker/auth.ts';

/*
 * /api/mail/inbox, /message and /reply: session-gated reads and replies over
 * the SUBMISSIONS bucket. Fixture style follows test/contact.test.mjs.
 */

const SECRET = 'test-session-secret';

function r2(seed = {}) {
  const store = new Map(Object.entries(seed));
  // Each write gets a new etag, so conditional puts behave as R2's do.
  const etags = new Map([...store.keys()].map((k, i) => [k, `s${i}`]));
  let seq = 0;
  return {
    store,
    bucket: {
      async put(key, value, opts = {}) {
        if (opts.onlyIf?.etagMatches && etags.get(key) !== opts.onlyIf.etagMatches) return null;
        store.set(key, typeof value === 'string' ? value : String(value));
        etags.set(key, `e${++seq}`);
        return { key };
      },
      async get(key) {
        const value = store.get(key);
        if (value === undefined) return null;
        return { etag: etags.get(key), async json() { return JSON.parse(value); } };
      },
      async delete(key) {
        store.delete(key);
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
  BOARD_ALLOWED_EMAILS: 'boss@example.co.za,pa@example.co.za',
  BOARD_ADMIN_EMAILS: 'boss@example.co.za',
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
    return new Response(JSON.stringify(ok ? { messageId: `<m${brevoCalls.length}@smtp-relay.mailin.fr>` } : {}), { status: ok ? 201 : 500 });
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
    assert.ok(brevoCalls[0].body.htmlContent.includes('Dankie vir jou boodskap.'));
    assert.ok(brevoCalls[0].body.htmlContent.includes('mailto:welkom@sdatygerberg.co.za'));
    assert.ok(brevoCalls[0].body.htmlContent.includes('src="https://sdatygerberg.co.za/oauth-logo.png"'));
    assert.ok(!('attachment' in brevoCalls[0].body));
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

  test('a fenced sender cannot see, so cannot reply to, a thread outside their addresses — 404', async () => {
    mockBrevo();
    const { bucket } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxReply(
      post({ id: 'abc-1', body: 'Hi' }, session),
      env(bucket, { BOARD_ADMIN_EMAILS: '', BOARD_SEND_AS: 'boss@example.co.za=kerk@sdatygerberg.co.za' }),
    );
    assert.equal(res.status, 404);
    assert.equal(brevoCalls.length, 0);
  });
});

describe('handleInboxDelete', () => {
  const del = (id, session) =>
    new Request(`https://x/api/mail/message?id=${id}`, {
      method: 'DELETE',
      headers: session ? { cookie: `__Host-kerkraad=${session}` } : {},
    });

  test('admin removes the thread; 401 without a session', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxDelete(del('abc-1'), env(bucket))).status, 401);
    const res = await handleInboxDelete(del('abc-1', session), env(bucket));
    assert.equal(res.status, 200);
    assert.equal(store.size, 0);
  });

  test('403 for a signed-in non-admin, without touching R2', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('pa@example.co.za', SECRET);
    const res = await handleInboxDelete(del('abc-1', session), env(bucket));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).outcome, 'forbidden');
    assert.equal(store.size, 1);
  });

  test('404 on unknown id, 400 on a traversal id', async () => {
    const { bucket } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxDelete(del('nope', session), env(bucket))).status, 404);
    assert.equal((await handleInboxDelete(del('../x', session), env(bucket))).status, 400);
  });
});

describe('handleInboxTrash', () => {
  const del = (id, session) =>
    new Request(`https://x/api/mail/message?id=${id}`, {
      method: 'DELETE',
      headers: session ? { cookie: `__Host-kerkraad=${session}` } : {},
    });
  const trash = (id, session) =>
    new Request(`https://x/api/mail/trash?id=${id}`, {
      method: 'PUT',
      headers: session ? { cookie: `__Host-kerkraad=${session}` } : {},
    });
  const sentKey = 'sent/2026/10/27/2026-10-27T10:00:00.000Z-abc123.json';
  const sentItem = (over = {}) => ({
    id: 'abc123',
    at: '2026-10-27T10:00:00.000Z',
    by: 'boss@example.co.za',
    from: 'welkom@sdatygerberg.co.za',
    to: ['friend@example.co.za'],
    subject: 'Sondag se diens',
    body: 'Hallo daar',
    kind: 'compose',
    threadId: null,
    ...over,
  });

  test('401 without a session, 403 for a non-admin', async () => {
    const { bucket } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxTrash(trash('abc-1'), env(bucket))).status, 401);
    const pa = await signSession('pa@example.co.za', SECRET);
    const res = await handleInboxTrash(trash('abc-1', pa), env(bucket));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).outcome, 'forbidden');
  });

  test('trash soft-deletes the thread; list with ?trashed=1 shows it, normal list does not', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxTrash(trash('abc-1', session), env(bucket))).status, 200);
    const saved = JSON.parse(store.get(key));
    assert.ok(saved.trashedAt);

    const normal = await handleInboxList(get('/api/mail/inbox?trashed=0', session), env(bucket));
    assert.equal((await normal.json()).items.length, 0);
    const onlyTrashed = await handleInboxList(get('/api/mail/inbox?trashed=1', session), env(bucket));
    assert.equal((await onlyTrashed.json()).items.length, 1);
  });

  test('404 on unknown id', async () => {
    const { bucket } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxTrash(trash('nope', session), env(bucket))).status, 404);
  });

  test('permanent delete removes a trashed thread', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item({ trashedAt: '2026-10-26T10:00:00.000Z' })) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxDelete(del('abc-1', session), env(bucket))).status, 200);
    assert.equal(store.size, 0);
  });

  test('permanent delete removes a sent item too', async () => {
    const { bucket, store } = r2({ [sentKey]: JSON.stringify(sentItem()) });
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxDelete(del('abc123', session), env(bucket))).status, 200);
    assert.equal(store.size, 0);
  });

  test('restore clears trashedAt and the thread leaves the trash list', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item({ trashedAt: '2026-10-26T10:00:00.000Z' })) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxTrash(new Request(`https://x/api/mail/trash?id=abc-1&restore=1`, { method: 'PUT', headers: { cookie: `__Host-kerkraad=${session}` } }), env(bucket));
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(store.get(key)).trashedAt, undefined);
    const onlyTrashed = await handleInboxList(get('/api/mail/inbox?trashed=1', session), env(bucket));
    assert.equal((await onlyTrashed.json()).items.length, 0);
  });
});

describe('handleInboxSent', () => {
  const sentKey = 'sent/2026/10/27/2026-10-27T10:00:00.000Z-abc123.json';
  const sentItem = (over = {}) => ({
    id: 'abc123',
    at: '2026-10-27T10:00:00.000Z',
    by: 'boss@example.co.za',
    from: 'welkom@sdatygerberg.co.za',
    to: ['friend@example.co.za'],
    subject: 'Sondag se diens',
    body: 'Hallo daar',
    kind: 'compose',
    threadId: null,
    ...over,
  });

  test('401 without a session, 503 without the bucket', async () => {
    assert.equal((await handleInboxSent(get('/api/mail/sent'), env(undefined))).status, 401);
    const session = await signSession('boss@example.co.za', SECRET);
    assert.equal((await handleInboxSent(get('/api/mail/sent', session), env(undefined))).status, 503);
  });

  test('lists newest first with bodies omitted, reads one fully', async () => {
    mockBrevo();
    const { bucket } = r2({ [sentKey]: JSON.stringify(sentItem()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const list = await handleInboxSent(get('/api/mail/sent', session), env(bucket));
    assert.equal(list.status, 200);
    const items = (await list.json()).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].subject, 'Sondag se diens');
    assert.ok(!('body' in items[0]));
    const one = await handleInboxSent(get('/api/mail/sent?id=abc123', session), env(bucket));
    assert.equal((await one.json()).item.body, 'Hallo daar');
  });

  test('a reply files a sent record for the Sent box', async () => {
    mockBrevo();
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleInboxReply(post({ id: 'abc-1', body: 'Dankie' }, session), env(bucket));
    assert.equal(res.status, 200);
    const sentKeys = [...store.keys()].filter((k) => k.startsWith('sent/'));
    assert.equal(sentKeys.length, 1);
    const recorded = JSON.parse(store.get(sentKeys[0]));
    assert.equal(recorded.kind, 'reply');
    assert.equal(recorded.threadId, 'abc-1');
    assert.equal(recorded.body, 'Dankie');
    assert.equal(JSON.parse(store.get(key)).replies[0].body, 'Dankie');
  });
});

describe('Board mail shows website enquiries only', () => {
  const emailKey = 'submissions/2026/11/01/2026-11-01T18:07:00.000Z-mail-1.json';
  const emailItem = item({ id: 'mail-1', topic: 'email', submittedAt: '2026-11-01T18:07:00.000Z', replyFrom: 'sanet@example.co.za', subject: 'Laura verslag' });

  test('inbox, message and reply skip mail that is not from the website forms', async () => {
    const { bucket } = r2({ [key]: JSON.stringify(item()), [emailKey]: JSON.stringify(emailItem) });
    const session = await signSession('boss@example.co.za', SECRET);
    const { items } = await (await handleInboxList(get('/api/mail/inbox', session), env(bucket))).json();
    assert.deepEqual(items.map((i) => i.id), ['abc-1']);
    assert.equal((await handleInboxMessage(get('/api/mail/message?id=mail-1', session), env(bucket))).status, 404);
    mockBrevo();
    assert.equal((await handleInboxReply(post({ id: 'mail-1', body: 'x' }, session), env(bucket))).status, 404);
    assert.equal(brevoCalls.length, 0);
  });
});

describe('read state', () => {
  test('opening a thread marks it read for the whole board; the list then counts it read', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('pa@example.co.za', SECRET);
    const before = (await (await handleInboxList(get('/api/mail/inbox', session), env(bucket))).json()).items;
    assert.equal(before.filter(isUnread).length, 1);
    const opened = (await (await handleInboxMessage(get('/api/mail/message?id=abc-1', session), env(bucket))).json()).item;
    assert.ok(opened.readAt);
    assert.equal(opened.readBy, 'pa@example.co.za');
    assert.equal(JSON.parse(store.get(key)).readBy, 'pa@example.co.za');
    const boss = await signSession('boss@example.co.za', SECRET);
    const after = (await (await handleInboxList(get('/api/mail/inbox', boss), env(bucket))).json()).items;
    assert.equal(after.filter(isUnread).length, 0);
  });

  test('a visitor answer after it was read makes it unread and New again', () => {
    const t = item({ readAt: '2026-10-26T09:00:00.000Z', replies: [{ by: 'boss@example.co.za', at: '2026-10-26T10:00:00.000Z' }] });
    assert.equal(isUnread(t), false);
    assert.equal(awaitingAnswer(t), false);
    t.replies.push({ by: 'jan@example.co.za', at: '2026-10-27T10:00:00.000Z', inbound: true });
    assert.equal(isUnread(t), true);
    assert.equal(awaitingAnswer(t), true);
    t.readAt = '2026-10-27T11:00:00.000Z';
    assert.equal(isUnread(t), false, 'opened after the answer');
    assert.equal(awaitingAnswer(t), true, 'still waiting for the board to answer');
  });
});

describe('admins can always reply', () => {
  test('a thread whose own address is not a configured sender is answered from the role address', async () => {
    mockBrevo();
    const { bucket } = r2({ [key]: JSON.stringify(item({ replyFrom: 'sanet@example.co.za' })) });
    const session = await signSession('boss@example.co.za', SECRET);
    const opened = (await (await handleInboxMessage(get('/api/mail/message?id=abc-1', session), env(bucket))).json()).item;
    assert.equal(opened.replyAs, 'welkom@sdatygerberg.co.za');
    const res = await handleInboxReply(post({ id: 'abc-1', body: 'Dankie.' }, session), env(bucket));
    assert.equal(res.status, 200);
    assert.equal(brevoCalls[0].body.sender.email, 'welkom@sdatygerberg.co.za');
  });
});

describe('threads: the board replies, the visitor answers by email', () => {
  test('the reply keeps the Message-ID Brevo gave it; the answer is filed under the thread', async () => {
    mockBrevo();
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    const session = await signSession('boss@example.co.za', SECRET);
    await handleInboxReply(post({ id: 'abc-1', body: 'Welkom!' }, session), env(bucket));
    const sent = JSON.parse(store.get(key)).replies[0];
    assert.equal(sent.messageId, '<m1@smtp-relay.mailin.fr>');
    assert.equal(brevoCalls[0].body.subject, 'Re: Jou boodskap aan Tygerberg SDA');

    const id = await fileInboundAnswer(bucket, {
      sender: 'Jan@Example.co.za', subject: 'Re: Jou boodskap aan Tygerberg SDA', text: 'Baie dankie!',
      messageId: '<a1@example.co.za>', inReplyTo: '<m1@smtp-relay.mailin.fr>',
    });
    assert.equal(id, 'abc-1');
    const thread = JSON.parse(store.get(key));
    assert.deepEqual(thread.replies.map((r) => [r.by, Boolean(r.inbound)]), [['boss@example.co.za', false], ['jan@example.co.za', true]]);
    assert.equal(isUnread(thread), true);

    // The same mail delivered twice is filed once.
    await fileInboundAnswer(bucket, { sender: 'jan@example.co.za', subject: 'Re: x', text: 'Baie dankie!', messageId: '<a1@example.co.za>', inReplyTo: '<m1@smtp-relay.mailin.fr>' });
    assert.equal(JSON.parse(store.get(key)).replies.length, 2);

    // The board answers again, then sees it.
    await handleInboxReply(post({ id: 'abc-1', body: 'Sien jou Sabbat.' }, session), env(bucket));
    assert.equal(JSON.parse(store.get(key)).replies.length, 3);
    assert.equal(awaitingAnswer(JSON.parse(store.get(key))), false);
  });

  test('without the header, the visitor address and our subject still find the thread', async () => {
    const answered = item({ replies: [{ by: 'boss@example.co.za', at: '2026-10-26T10:00:00.000Z' }] });
    const { bucket, store } = r2({ [key]: JSON.stringify(answered) });
    assert.equal(await fileInboundAnswer(bucket, { sender: 'jan@example.co.za', subject: 'RE: Jou boodskap aan Tygerberg SDA', text: 'Ja' }), 'abc-1');
    assert.equal(JSON.parse(store.get(key)).replies.length, 2);
  });

  test('anything else is not filed: a thread we never answered, another sender, another subject', async () => {
    const { bucket, store } = r2({ [key]: JSON.stringify(item()) });
    assert.equal(await fileInboundAnswer(bucket, { sender: 'jan@example.co.za', subject: 'Re: Jou boodskap aan Tygerberg SDA', text: 'x' }), null);
    const answered = item({ replies: [{ by: 'boss@example.co.za', at: '2026-10-26T10:00:00.000Z' }] });
    store.set(key, JSON.stringify(answered));
    assert.equal(await fileInboundAnswer(bucket, { sender: 'other@example.co.za', subject: 'Re: Jou boodskap aan Tygerberg SDA', text: 'x' }), null);
    assert.equal(await fileInboundAnswer(bucket, { sender: 'jan@example.co.za', subject: 'Laura verslag', text: 'x' }), null);
  });

  test('stripQuoted keeps what the visitor wrote', () => {
    assert.equal(stripQuoted('Ja dankie\n\nOn Sun, 1 Nov 2026, Welkom wrote:\n> Hallo'), 'Ja dankie');
    assert.equal(stripQuoted('Ja\n\nOp So. 1 Nov. 2026 om 10:00 het Welkom geskryf:\n> Hallo'), 'Ja');
    assert.equal(stripQuoted('Ja\n-----Original Message-----\nFrom: x'), 'Ja');
    assert.equal(stripQuoted('> only a quote'), '> only a quote', 'never empties the message');
  });
});

describe('each member sees only the mail of addresses they may send as', () => {
  const sentKey = (id, from) => [`sent/2026/11/01/2026-11-01T10:00:00.000Z-${id}.json`, JSON.stringify({ id, at: '2026-11-01T10:00:00.000Z', by: 'x@example.co.za', from, to: ['v@example.co.za'], subject: 's', body: 'b', kind: 'compose', threadId: null })];
  const fenced = {
    BOARD_ADMIN_EMAILS: 'boss@example.co.za',
    BOARD_SEND_AS: 'pa@example.co.za=tesourier@sdatygerberg.co.za,welkom@sdatygerberg.co.za;kerk@example.co.za=kerk@sdatygerberg.co.za',
    BOARD_ALLOWED_EMAILS: 'boss@example.co.za,pa@example.co.za,kerk@example.co.za',
  };
  const seed = () =>
    r2({
      [key]: JSON.stringify(item()),
      ...Object.fromEntries([sentKey('s-welkom', 'welkom@sdatygerberg.co.za'), sentKey('s-klerk', 'klerk@sdatygerberg.co.za'), sentKey('s-tes', 'tesourier@sdatygerberg.co.za')]),
    }).bucket;

  test('inbox: website enquiries (answered as welkom@) only for members who may send as welkom@', async () => {
    const bucket = seed();
    const list = async (email) => (await (await handleInboxList(get('/api/mail/inbox', await signSession(email, SECRET)), env(bucket, fenced))).json()).items.map((i) => i.id);
    assert.deepEqual(await list('pa@example.co.za'), ['abc-1']);
    assert.deepEqual(await list('kerk@example.co.za'), []);
    assert.deepEqual(await list('boss@example.co.za'), ['abc-1']);
    const read = await handleInboxMessage(get('/api/mail/message?id=abc-1', await signSession('kerk@example.co.za', SECRET)), env(bucket, fenced));
    assert.equal(read.status, 404);
  });

  test('sent: only items from addresses the member may send as; admins see all', async () => {
    const bucket = seed();
    const sent = async (email) => (await (await handleInboxSent(get('/api/mail/sent', await signSession(email, SECRET)), env(bucket, fenced))).json()).items.map((i) => i.id).sort();
    assert.deepEqual(await sent('pa@example.co.za'), ['s-tes', 's-welkom']);
    assert.deepEqual(await sent('kerk@example.co.za'), []);
    assert.deepEqual(await sent('boss@example.co.za'), ['s-klerk', 's-tes', 's-welkom']);
    const one = await handleInboxSent(get('/api/mail/sent?id=s-klerk', await signSession('pa@example.co.za', SECRET)), env(bucket, fenced));
    assert.equal(one.status, 404);
  });
});
