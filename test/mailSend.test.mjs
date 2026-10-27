import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { handleMailSend } from '../src/worker/mailSend.ts';
import { signSession } from '../src/worker/auth.ts';

/*
 * POST /api/mail/send for /kerkraad: transport guards, session gate,
 * validation, then Brevo. Fixture style follows test/contact.test.mjs.
 */

const SECRET = 'test-session-secret';
const FROM = 'welkom@sdatygerberg.co.za';

const env = (over = {}) => ({
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: 'boss@example.co.za',
  BREVO_API_KEY: 'test-brevo-key',
  MAIL_SEND_FROM: `${FROM},klerk@sdatygerberg.co.za,tesourier@sdatygerberg.co.za,kerk@sdatygerberg.co.za`,
  ...over,
});

const goodBody = (over = {}) => ({
  from: FROM,
  to: ['friend@example.co.za'],
  subject: 'Sondag se diens',
  body: 'Hallo, hier is die inligting.',
  ...over,
});

const post = (body, { origin = 'https://x', cookie } = {}) =>
  new Request('https://x/api/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { cookie: `__Host-kerkraad=${cookie}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
let brevoCalls;

function mockBrevo({ ok = true, throws = false } = {}) {
  brevoCalls = [];
  globalThis.fetch = async (url, init) => {
    brevoCalls.push({ url: String(url), body: JSON.parse(init.body) });
    if (throws) throw new Error('net down');
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

describe('handleMailSend transport guards', () => {
  test('rejects non-POST with 405', async () => {
    const res = await handleMailSend(new Request('https://x/api/mail/send'), env());
    assert.equal(res.status, 405);
  });

  test('413 on oversize bodies, 400 on malformed JSON', async () => {
    const big = goodBody({ body: 'x'.repeat(17 * 1024) });
    assert.equal((await handleMailSend(post(big), env())).status, 413);
    assert.equal((await handleMailSend(post('{broken'), env())).status, 400);
  });

  test('503 when a secret is absent, 401 without a session', async () => {
    mockBrevo();
    const noKey = await handleMailSend(post(goodBody()), env({ BREVO_API_KEY: undefined }));
    assert.equal(noKey.status, 503);
    assert.equal((await noKey.json()).outcome, 'not-configured');
    const noCookie = await handleMailSend(post(goodBody()), env());
    assert.equal(noCookie.status, 401);
    assert.equal((await noCookie.json()).outcome, 'unauthorised');
    assert.equal(brevoCalls.length, 0);
  });

  test('every response carries no-store', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSend(post(goodBody(), { cookie: session }), env());
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
  });
});

describe('handleMailSend validation', () => {
  test('unlisted From, bad recipients, and over-length fields are invalid', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const cases = [
      goodBody({ from: 'stranger@example.com' }),
      goodBody({ to: [] }),
      goodBody({ to: ['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co', 'f@x.co'] }),
      goodBody({ to: ['not-an-email'] }),
      goodBody({ subject: 'x'.repeat(151) }),
      goodBody({ body: 'x'.repeat(10_001) }),
    ];
    for (const payload of cases) {
      const res = await handleMailSend(post(payload, { cookie: session }), env());
      assert.equal(res.status, 400, JSON.stringify(payload).slice(0, 60));
      assert.equal((await res.json()).outcome, 'invalid');
    }
    assert.equal(brevoCalls.length, 0);
  });

  test('missing Origin is rejected even with a valid session', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSend(post(goodBody(), { cookie: session, origin: '' }), env());
    assert.equal(res.status, 403);
    assert.deepEqual((await res.json()).errors, ['origin']);
    assert.equal(brevoCalls.length, 0);
  });

  test('header injection in the subject is flattened, not sent raw', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSend(
      post(goodBody({ subject: 'Aanddiens\r\nBcc: evil@x.co' }), { cookie: session }),
      env(),
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(brevoCalls[0].body.subject, /[\r\n]/);
  });
});

describe('handleMailSend delivery', () => {
  test('success posts the Brevo shape with replyTo and archive BCC, and no footer', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSend(post(goodBody(), { cookie: session }), env());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).outcome, 'sent');
    const sent = brevoCalls[0].body;
    assert.equal(sent.sender.email, FROM);
    assert.deepEqual(sent.to, [{ email: 'friend@example.co.za' }]);
    assert.equal(sent.replyTo.email, FROM);
    assert.deepEqual(sent.bcc, [{ email: 'archive@sdatygerberg.co.za' }]);
    assert.ok(!/Gestuur deur/.test(sent.textContent));
    // HTML alternative: the message escaped, then the church signature.
    assert.ok(sent.htmlContent.includes('Hallo, hier is die inligting.'));
    assert.ok(sent.htmlContent.includes('Tygerberg SDA Kerk'));
    assert.ok(sent.htmlContent.includes(`mailto:${FROM}`));
  });

  test('the HTML alternative escapes markup in the message', async () => {
    mockBrevo();
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSend(
      post(goodBody({ body: '<script>alert(1)</script>' }), { cookie: session }),
      env(),
    );
    assert.equal(res.status, 200);
    const sent = brevoCalls[0].body;
    assert.ok(sent.htmlContent.includes('&lt;script&gt;'));
    assert.ok(!sent.htmlContent.includes('<script>alert'));
  });

  test('Brevo failure and timeout become send-error', async () => {
    const session = await signSession('boss@example.co.za', SECRET);
    mockBrevo({ ok: false });
    const failed = await handleMailSend(post(goodBody(), { cookie: session }), env());
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).outcome, 'send-error');
    mockBrevo({ throws: true });
    const timedOut = await handleMailSend(post(goodBody(), { cookie: session }), env());
    assert.equal(timedOut.status, 502);
  });

  test('a member removed mid-session can no longer send', async () => {
    mockBrevo();
    const session = await signSession('gone@example.co.za', SECRET);
    const res = await handleMailSend(post(goodBody(), { cookie: session }), env());
    assert.equal(res.status, 401);
    assert.equal(brevoCalls.length, 0);
  });
});
