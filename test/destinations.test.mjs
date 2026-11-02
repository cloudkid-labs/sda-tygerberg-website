import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { signSession } from '../src/worker/auth.ts';
import { ADD_LIMIT, ADDS_KEY, VERIFIED_KEY } from '../src/worker/destinations.ts';
import { withSettings, SETTINGS_KEY } from '../src/worker/settings.ts';
import { r2Mock } from './r2Mock.mjs';

/*
 * Settings → Email settings → Destination addresses (C-72): a SuperAdmin adds
 * a Cloudflare destination address through the API; once verified it is an
 * inbound-route target without a deploy, while notifications stay fenced to
 * the deploy's MAIL_DESTINATIONS. Hidden addresses are never managed.
 */

globalThis.caches ??= { default: { async match() {}, async put() {} } };
const { default: worker } = await import('../src/worker/index.ts');

const SECRET = 'test-session-secret';
const SUPER = 'super@example.co.za';
const ADMIN = 'admin@example.co.za';
const CLERK = 'clerk@example.co.za';
const ORIGIN = 'https://x';
const D = 'sdatygerberg.co.za';
const TOKEN = 'test-routing-token';
const ACCOUNT = '0123456789abcdef0123456789abcdef';

const env = (over = {}) => ({
  SESSION_SECRET: SECRET,
  BOARD_SUPER_ADMIN_EMAILS: SUPER,
  BOARD_ADMIN_EMAILS: `${SUPER},${ADMIN}`,
  BOARD_ALLOWED_EMAILS: `${ADMIN},${CLERK}`,
  BOARD_SEND_AS: `${CLERK}=klerk@${D}`,
  MAIL_SEND_FROM: `welkom@${D},klerk@${D},tesourier@${D}`,
  MAIL_ROUTES: {},
  MAIL_FORWARD_TO: 'clerk-inbox@example.co.za',
  MAIL_ARCHIVE_TO: `archive@${D}`,
  MAIL_DESTINATIONS: `clerk-inbox@example.co.za,archive@${D}`,
  MAIL_DESTINATIONS_HIDDEN: `other-ministry@example.org,archive@${D}`,
  CONTACT_EMAIL_TO: 'clerk-inbox@example.co.za',
  CONTACT_EMAIL_FROM: `welkom@${D}`,
  EMAIL_ROUTING_API_TOKEN: TOKEN,
  EMAIL_ROUTING_ACCOUNT_ID: ACCOUNT,
  CMS: r2Mock(),
  ASSETS: { async fetch() { return new Response('asset', { status: 404 }); } },
  ...over,
});
const ctx = { waitUntil() {} };
const cookieFor = async (email) => `__Host-kerkraad=${await signSession(email, SECRET)}`;

async function call(e, method, path, { body, as = SUPER } = {}) {
  const headers = { cookie: await cookieFor(as) };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers.origin = ORIGIN;
  }
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e, ctx);
  const text = await res.text();
  return { status: res.status, text, data: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
}

/** A fake Cloudflare Email Routing addresses API. */
let account;
let calls;
let failPost;
const realFetch = globalThis.fetch;
beforeEach(() => {
  account = [
    { email: 'clerk-inbox@example.co.za', verified: '2026-01-01T00:00:00Z' },
    { email: 'treasurer@example.co.za', verified: '2026-01-01T00:00:00Z' },
    { email: 'pending@example.co.za', verified: null },
    { email: 'other-ministry@example.org', verified: '2026-01-01T00:00:00Z' },
    { email: `archive@${D}`, verified: '2026-01-01T00:00:00Z' },
  ];
  calls = [];
  failPost = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.cloudflare.com/')) return realFetch(url, init);
    calls.push({ url: u, method: init.method, auth: init.headers?.Authorization, body: init.body });
    assert.ok(u.includes(`/accounts/${ACCOUNT}/email/routing/addresses`));
    if (init.method === 'POST') {
      if (failPost) return Response.json({ success: false, errors: [{ code: 1000 }] }, { status: 500 });
      const { email } = JSON.parse(init.body);
      account.push({ email, verified: null });
      return Response.json({ success: true, result: { email, verified: null } });
    }
    return Response.json({ success: true, result: account, result_info: { total_pages: 1 } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const quiet = async (fn) => {
  const [log, err] = [console.log, console.error];
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = err;
  }
};

describe('/api/cms/destinations', () => {
  test('SuperAdmins only: an admin made in Settings and a member are refused', async () => {
    const e = env();
    assert.equal((await call(e, 'GET', '/api/cms/destinations', { as: ADMIN })).status, 403);
    assert.equal((await call(e, 'GET', '/api/cms/destinations', { as: CLERK })).status, 403);
    assert.equal((await quiet(() => call(e, 'POST', '/api/cms/destinations', { as: ADMIN, body: { email: 'x@example.com' } }))).status, 403);
    assert.equal(calls.length, 0, 'Cloudflare never asked');
  });

  test('without the token or a valid account id, the section is off', async () => {
    for (const over of [{ EMAIL_ROUTING_API_TOKEN: undefined }, { EMAIL_ROUTING_ACCOUNT_ID: '../zones' }]) {
      const r = await call(env(over), 'GET', '/api/cms/destinations');
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, { ok: true, configured: false, items: [], remaining: 0 });
    }
    assert.equal(calls.length, 0);
  });

  test('lists manageable addresses only, with their state, and remembers the verified ones', async () => {
    const e = env();
    const r = await call(e, 'GET', '/api/cms/destinations');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.items, [
      { email: 'clerk-inbox@example.co.za', verified: true, notify: true },
      { email: 'pending@example.co.za', verified: false, notify: false },
      { email: 'treasurer@example.co.za', verified: true, notify: false },
    ]);
    assert.equal(r.data.remaining, ADD_LIMIT);
    assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
    assert.equal(r.text.includes(TOKEN), false, 'the token never reaches the page');
    const saved = await (await e.CMS.get(VERIFIED_KEY)).json();
    assert.deepEqual(saved.verified, ['clerk-inbox@example.co.za', 'treasurer@example.co.za'], 'hidden and church-domain addresses excluded');
  });

  test('adds an address: Cloudflare is asked, the add is audited', async () => {
    const e = env();
    const r = await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: ' New@Example.com ' } }));
    assert.equal(r.status, 200);
    const post = calls.find((c) => c.method === 'POST');
    assert.deepEqual(JSON.parse(post.body), { email: 'new@example.com' });
    assert.deepEqual(r.data.items.find((d) => d.email === 'new@example.com'), { email: 'new@example.com', verified: false, notify: false });
    assert.equal(r.data.remaining, ADD_LIMIT - 1);
    const auditKeys = e.CMS.keys().filter((k) => k.startsWith('audit/'));
    assert.equal(auditKeys.length, 1);
    const line = await (await e.CMS.get(auditKeys[0])).json();
    assert.equal(line.action, 'destination.add');
    assert.equal(line.by, SUPER);
    assert.deepEqual(line.changes, [{ op: 'added', label: 'new@example.com' }]);
  });

  test('refuses hidden, church-domain, malformed and existing addresses without asking Cloudflare to add', async () => {
    const e = env();
    for (const email of ['other-ministry@example.org', `archive@${D}`, `klerk@${D}`, 'not-an-address', '']) {
      const r = await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email } }));
      assert.equal(r.status, 400, email);
      assert.deepEqual(r.data.errors, ['email']);
    }
    const dup = await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: 'pending@example.co.za' } }));
    assert.equal(dup.status, 409);
    assert.equal(dup.data.outcome, 'exists');
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  });

  test(`at most ${ADD_LIMIT} adds a day, failed ones included`, async () => {
    const e = env();
    failPost = true;
    const failed = await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: 'a0@example.com' } }));
    assert.equal(failed.status, 502);
    assert.equal(e.CMS.keys().some((k) => k.startsWith('audit/')), false, 'nothing added, nothing audited');
    failPost = false;
    for (let i = 1; i < ADD_LIMIT; i++) {
      assert.equal((await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: `a${i}@example.com` } }))).status, 200);
    }
    const over = await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: 'one-too-many@example.com' } }));
    assert.equal(over.status, 429);
    assert.equal(over.data.outcome, 'rate-limited');
    assert.equal(calls.filter((c) => c.method === 'POST').length, ADD_LIMIT);

    // A day later the window has moved on.
    const doc = await (await e.CMS.get(ADDS_KEY)).json();
    doc.adds = doc.adds.map((a) => ({ ...a, at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }));
    await e.CMS.put(ADDS_KEY, JSON.stringify(doc));
    assert.equal((await quiet(() => call(e, 'POST', '/api/cms/destinations', { body: { email: 'next-day@example.com' } }))).status, 200);
  });

  test('Cloudflare down: a clear upstream error', async () => {
    globalThis.fetch = async () => {
      throw new Error('network');
    };
    const r = await quiet(() => call(env(), 'GET', '/api/cms/destinations'));
    assert.equal(r.status, 502);
    assert.equal(r.data.outcome, 'upstream');
  });
});

describe('verified addresses in Settings', () => {
  const settings = (over = {}) => ({
    members: [{ email: CLERK, sendAs: [`klerk@${D}`] }],
    routes: [{ address: `tesourier@${D}`, to: 'treasurer@example.co.za' }],
    notify: ['clerk-inbox@example.co.za'],
    profiles: [],
    ...over,
  });

  test('a newly verified address is a route target without a deploy, but not a notification target', async () => {
    const e = env();
    const got = await call(e, 'GET', '/api/cms/settings');
    assert.equal(got.data.manageDestinations, true);
    assert.deepEqual(got.data.options.destinations, ['clerk-inbox@example.co.za', `archive@${D}`]);
    assert.ok(got.data.options.routeDestinations.includes('treasurer@example.co.za'));
    assert.equal(got.data.options.routeDestinations.includes('pending@example.co.za'), false, 'unverified');
    assert.equal(got.data.options.routeDestinations.includes('other-ministry@example.org'), false, 'hidden');

    const notify = await quiet(() => call(e, 'PUT', '/api/cms/settings', { body: { rev: 0, settings: settings({ notify: ['treasurer@example.co.za'] }) } }));
    assert.equal(notify.status, 400);
    assert.deepEqual(notify.data.errors, ['notify'], 'notifications still need the deploy fence');

    const pending = await quiet(() => call(e, 'PUT', '/api/cms/settings', { body: { rev: 0, settings: settings({ routes: [{ address: `x@${D}`, to: 'pending@example.co.za' }] }) } }));
    assert.deepEqual(pending.data.errors, ['routes.0.to']);

    const ok = await quiet(() => call(e, 'PUT', '/api/cms/settings', { body: { rev: 0, settings: settings() } }));
    assert.equal(ok.status, 200);
    // Inbound mail reads the remembered list, not Cloudflare.
    calls = [];
    const applied = await withSettings(e);
    assert.deepEqual(applied.MAIL_ROUTES, { [`tesourier@${D}`]: 'treasurer@example.co.za' });
    assert.equal(calls.length, 0);
  });

  test('an admin made in Settings does not get the section', async () => {
    const r = await call(env(), 'GET', '/api/cms/settings', { as: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.data.manageDestinations, false);
  });

  test('an address no longer verified stops routing', async () => {
    const e = env();
    await e.CMS.put(SETTINGS_KEY, JSON.stringify({ rev: 1, settings: settings(), updatedBy: SUPER, updatedAt: '2026-01-01T00:00:00Z' }));
    await e.CMS.put(VERIFIED_KEY, JSON.stringify({ verified: [], checkedAt: '2026-01-02T00:00:00Z' }));
    assert.deepEqual((await withSettings(e)).MAIL_ROUTES, {});
  });
});
