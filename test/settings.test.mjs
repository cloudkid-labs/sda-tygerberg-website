import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { signSession, allowedFrom } from '../src/worker/auth.ts';
import { validateSettings } from '../src/lib/mailSettings.ts';
import { applySettings, settingsFromConfig, settingsOptions, withSettings, SETTINGS_KEY } from '../src/worker/settings.ts';
import { r2Mock } from './r2Mock.mjs';

/*
 * The Settings tab (C-71): admins edit who may sign in, who sends as (and so
 * sees) which address, inbound routes and enquiry notifications. Saved
 * settings stand in for their wrangler vars on every path that reads them.
 */

globalThis.caches ??= { default: { async match() {}, async put() {} } };
const { default: worker } = await import('../src/worker/index.ts');

const SECRET = 'test-session-secret';
const ADMIN = 'admin@example.co.za';
const CLERK = 'clerk@example.co.za';
const TREASURER = 'treasurer@example.co.za';
const ORIGIN = 'https://x';
const D = 'sdatygerberg.co.za';

const env = (over = {}) => ({
  SESSION_SECRET: SECRET,
  BOARD_ADMIN_EMAILS: ADMIN,
  BOARD_ALLOWED_EMAILS: `${CLERK},${TREASURER}`,
  BOARD_SEND_AS: `${CLERK}=klerk@${D},welkom@${D};${TREASURER}=tesourier@${D}`,
  BOARD_ADMIN_ONLY_EMAILS: `archive@${D}`,
  MAIL_SEND_FROM: `welkom@${D},klerk@${D},tesourier@${D},kerk@${D}`,
  MAIL_ROUTES: { [`tesourier@${D}`]: 'treasurer-inbox@example.co.za' },
  MAIL_FORWARD_TO: 'clerk-inbox@example.co.za',
  MAIL_ARCHIVE_TO: `archive@${D}`,
  MAIL_DESTINATIONS: `clerk-inbox@example.co.za,treasurer-inbox@example.co.za,admin-inbox@example.co.za,archive@${D}`,
  CONTACT_EMAIL_TO: 'clerk-inbox@example.co.za',
  CONTACT_EMAIL_FROM: `welkom@${D}`,
  CMS: r2Mock(),
  ASSETS: { async fetch() { return new Response('asset', { status: 404 }); } },
  ...over,
});
const ctx = { waitUntil() {} };
const cookieFor = async (email) => `__Host-kerkraad=${await signSession(email, SECRET)}`;

async function call(e, method, path, { body, cookie, origin = ORIGIN } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers.origin = origin;
  }
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e, ctx);
  return { status: res.status, data: res.headers.get('content-type')?.includes('json') ? await res.json() : null };
}

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

describe('validateSettings', () => {
  const o = settingsOptions(env());
  const ok = { members: [{ email: CLERK, sendAs: [`welkom@${D}`] }], routes: [{ address: `rainier@${D}`, to: 'admin-inbox@example.co.za' }], notify: ['clerk-inbox@example.co.za'] };

  test('a good document normalises addresses', () => {
    const r = validateSettings({ ...ok, members: [{ email: ' Clerk@Example.co.za ', sendAs: [`WELKOM@${D}`] }] }, o);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.members, [{ email: CLERK, sendAs: [`welkom@${D}`] }]);
  });

  test('refuses what the deploy config does not allow', () => {
    const bad = (patch) => validateSettings({ ...ok, ...patch }, o);
    assert.deepEqual(bad({ members: [{ email: ADMIN, sendAs: [] }] }).errors, ['members.0.email'], 'admins stay in deploy config');
    assert.deepEqual(bad({ members: [{ email: CLERK, sendAs: [`archive@${D}`] }] }).errors, ['members.0.sendAs'], 'admin-only identity');
    assert.deepEqual(bad({ members: [{ email: 'nope', sendAs: [] }] }).errors, ['members.0.email']);
    assert.deepEqual(bad({ members: [{ email: CLERK, sendAs: [] }, { email: CLERK, sendAs: [] }] }).errors, ['members.1.email'], 'duplicate');
    assert.deepEqual(bad({ routes: [{ address: 'x@elsewhere.com', to: 'admin-inbox@example.co.za' }] }).errors, ['routes.0.address'], 'off-domain');
    assert.deepEqual(bad({ routes: [{ address: `archive@${D}`, to: 'admin-inbox@example.co.za' }] }).errors, ['routes.0.address'], 'archive would loop');
    assert.deepEqual(bad({ routes: [{ address: `x@${D}`, to: 'unverified@example.co.za' }] }).errors, ['routes.0.to'], 'unverified destination');
    assert.deepEqual(bad({ notify: [] }).errors, ['notify.empty']);
    assert.deepEqual(bad({ notify: [`archive@${D}`] }).errors, ['notify']);
    assert.deepEqual(bad({ notify: ['unverified@example.co.za'] }).errors, ['notify']);
  });
});

describe('settings from config, and laid over it', () => {
  test('before any save, the tab shows exactly what the vars say', () => {
    assert.deepEqual(settingsFromConfig(env()), {
      members: [
        { email: CLERK, sendAs: [`klerk@${D}`, `welkom@${D}`] },
        { email: TREASURER, sendAs: [`tesourier@${D}`] },
      ],
      routes: [{ address: `tesourier@${D}`, to: 'treasurer-inbox@example.co.za' }],
      notify: ['clerk-inbox@example.co.za'],
    });
  });

  test('saved settings drive sign-in, send-as, routes and notifications', () => {
    const e = applySettings(env(), {
      members: [{ email: CLERK, sendAs: [`kerk@${D}`] }, { email: 'new@example.co.za', sendAs: [] }],
      routes: [{ address: `rainier@${D}`, to: 'admin-inbox@example.co.za' }],
      notify: ['clerk-inbox@example.co.za', 'treasurer-inbox@example.co.za'],
    });
    assert.deepEqual(allowedFrom(e, CLERK), [`kerk@${D}`]);
    assert.deepEqual(allowedFrom(e, 'new@example.co.za'), [], 'no addresses: fenced to none, not all');
    assert.equal(e.BOARD_ALLOWED_EMAILS.includes(TREASURER), false, 'removed members can no longer sign in');
    assert.deepEqual(e.MAIL_ROUTES, { [`rainier@${D}`]: 'admin-inbox@example.co.za' });
    assert.equal(e.CONTACT_EMAIL_TO, 'clerk-inbox@example.co.za,treasurer-inbox@example.co.za');
    assert.equal(allowedFrom(e, ADMIN).length, 5, 'admins keep every address');
  });

  test('anything the deploy config no longer allows is dropped, not trusted', () => {
    const e = applySettings(env(), {
      members: [{ email: CLERK, sendAs: [`gone@${D}`, `welkom@${D}`] }],
      routes: [{ address: `x@${D}`, to: 'no-longer-verified@example.co.za' }],
      notify: ['no-longer-verified@example.co.za'],
    });
    assert.deepEqual(allowedFrom(e, CLERK), [`welkom@${D}`]);
    assert.deepEqual(e.MAIL_ROUTES, {});
    assert.equal(e.CONTACT_EMAIL_TO, 'clerk-inbox@example.co.za', 'nobody left to notify: the var stands');
  });

  test('a failed settings read falls back to the vars', async () => {
    const e = env({ CMS: { async get() { throw new Error('r2 down'); } } });
    assert.equal(await quiet(() => withSettings(e)), e);
  });
});

describe('/api/cms/settings', () => {
  const next = {
    members: [
      { email: CLERK, sendAs: [`welkom@${D}`] },
      { email: 'laura@example.co.za', sendAs: [`welkom@${D}`] },
    ],
    routes: [{ address: `rainier@${D}`, to: 'admin-inbox@example.co.za' }],
    notify: ['clerk-inbox@example.co.za', 'treasurer-inbox@example.co.za'],
  };

  test('admins only: members get 403, strangers 403 at the gate, no session 401', async () => {
    const e = env();
    assert.equal((await call(e, 'GET', '/api/cms/settings')).status, 401);
    assert.equal((await call(e, 'GET', '/api/cms/settings', { cookie: await cookieFor(CLERK) })).status, 403);
    assert.equal((await call(e, 'PUT', '/api/cms/settings', { cookie: await cookieFor(CLERK), body: { rev: 0, settings: next } })).status, 403);
  });

  test('GET before a save answers the config, with what may be chosen', async () => {
    const r = await call(env(), 'GET', '/api/cms/settings', { cookie: await cookieFor(ADMIN) });
    assert.equal(r.status, 200);
    assert.equal(r.data.source, 'config');
    assert.equal(r.data.rev, 0);
    assert.deepEqual(r.data.options.senders, [`welkom@${D}`, `klerk@${D}`, `tesourier@${D}`, `kerk@${D}`]);
    assert.deepEqual(r.data.options.admins, [ADMIN]);
  });

  test('a save takes effect at once: the new member signs in and sees only their addresses', async () => {
    const e = env();
    const admin = await cookieFor(ADMIN);
    const saved = await quiet(() => call(e, 'PUT', '/api/cms/settings', { cookie: admin, body: { rev: 0, settings: next } }));
    assert.equal(saved.status, 200);
    assert.equal(saved.data.rev, 1);
    assert.ok(e.CMS.keys().includes(SETTINGS_KEY));

    const laura = await call(e, 'GET', '/api/mail/session', { cookie: await cookieFor('laura@example.co.za') });
    assert.equal(laura.status, 200);
    assert.deepEqual(laura.data.allowedFrom, [`welkom@${D}`]);
    const treasurer = await call(e, 'GET', '/api/mail/session', { cookie: await cookieFor(TREASURER) });
    assert.notEqual(treasurer.status, 200, 'removed from the members list: no longer signed in');

    const audit = await call(e, 'GET', '/api/cms/audit', { cookie: admin });
    const line = audit.data.items.find((a) => a.action === 'settings.save');
    assert.ok(line, 'the save is in Recent changes');
    assert.ok(line.changes.some((c) => c.op === 'added' && c.label === 'laura@example.co.za'));
    assert.ok(line.changes.some((c) => c.op === 'removed' && c.label === TREASURER));
  });

  test('stale rev → 409; invalid → 400 naming the field; cross-site → 403', async () => {
    const e = env();
    const admin = await cookieFor(ADMIN);
    await quiet(() => call(e, 'PUT', '/api/cms/settings', { cookie: admin, body: { rev: 0, settings: next } }));
    assert.equal((await call(e, 'PUT', '/api/cms/settings', { cookie: admin, body: { rev: 0, settings: next } })).status, 409);
    const bad = await call(e, 'PUT', '/api/cms/settings', { cookie: admin, body: { rev: 1, settings: { ...next, notify: ['x@evil.example'] } } });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.data.errors, ['notify']);
    assert.equal((await call(e, 'PUT', '/api/cms/settings', { cookie: admin, body: { rev: 1, settings: next }, origin: 'https://evil.example' })).status, 403);
  });
});
