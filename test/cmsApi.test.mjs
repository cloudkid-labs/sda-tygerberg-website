import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { signSession } from '../src/worker/auth.ts';
import { r2Mock } from './r2Mock.mjs';

/*
 * /api/cms/* re-checks the session and the allow-list on every call, reads
 * included (C-70). Writes are same-origin JSON only, versioned (409 on a
 * stale rev), stamped from the session, kept in history and audited.
 */

globalThis.caches ??= { default: { async match() {}, async put() {} } };
const { default: worker } = await import('../src/worker/index.ts');

const SECRET = 'test-session-secret';
const BOARD = 'boss@example.co.za';
const ORIGIN = 'https://x';

const env = (over = {}) => ({
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: BOARD,
  CMS: r2Mock(),
  ASSETS: { async fetch(req) { return new Response(`asset:${new URL(req.url).pathname}`, { status: 404 }); } },
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
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  return { status: res.status, data: res.headers.get('content-type')?.includes('json') ? await res.json() : null };
}

const ROUTES = [
  ['GET', '/api/cms/events'],
  ['PUT', '/api/cms/events'],
  ['GET', '/api/cms/heads'],
  ['PUT', '/api/cms/heads'],
  ['GET', '/api/cms/pages'],
  ['PUT', '/api/cms/pages'],
  ['POST', '/api/cms/media?kind=page'],
  ['GET', '/api/cms/audit'],
];

describe('every CMS endpoint is members-only', () => {
  for (const [method, path] of ROUTES) {
    test(`${method} ${path}: no session → 401`, async () => {
      const r = await call(env(), method, path, method === 'GET' ? {} : { body: {} });
      assert.equal(r.status, 401);
    });

    test(`${method} ${path}: a signed-in non-member → 401, nothing read or written`, async () => {
      const e = env();
      const r = await call(e, method, path, { cookie: await cookieFor('stranger@example.co.za'), ...(method === 'GET' ? {} : { body: {} }) });
      assert.equal(r.status, 401);
      assert.deepEqual(e.CMS.keys(), []);
    });
  }

  test('no bucket bound → 503 not-configured, even for a member', async () => {
    const r = await call(env({ CMS: undefined }), 'GET', '/api/cms/events', { cookie: await cookieFor(BOARD) });
    assert.equal(r.status, 503);
    assert.equal(r.data.outcome, 'not-configured');
  });
});

describe('events', () => {
  test('an empty bucket reads as the seed, rev 0', async () => {
    const r = await call(env(), 'GET', '/api/cms/events', { cookie: await cookieFor(BOARD) });
    assert.equal(r.status, 200);
    assert.equal(r.data.rev, 0);
    assert.equal(r.data.items[0].name.af, 'Biduur');
  });

  test('a cross-origin write is refused', async () => {
    const e = env();
    const r = await call(e, 'PUT', '/api/cms/events', { cookie: await cookieFor(BOARD), body: { rev: 0, items: [] }, origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.deepEqual(e.CMS.keys(), []);
  });

  test('save stamps changed items, keeps history and audits; stale rev → 409', async () => {
    const e = env();
    const cookie = await cookieFor(BOARD);
    const { data: first } = await call(e, 'GET', '/api/cms/events', { cookie });
    const items = first.items.map(({ updatedBy, updatedAt, ...rest }) => rest);
    items[0] = { ...items[0], name: { af: 'Biduur (nuut)', en: 'Prayer (new)' } };
    const saved = await call(e, 'PUT', '/api/cms/events', { cookie, body: { rev: 0, items } });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.rev, 1);
    assert.equal(saved.data.items[0].updatedBy, BOARD);
    assert.equal(saved.data.items[1].updatedBy, 'seed', 'untouched items keep their stamps');

    const stale = await call(e, 'PUT', '/api/cms/events', { cookie, body: { rev: 0, items } });
    assert.equal(stale.status, 409);

    items.reverse();
    const again = await call(e, 'PUT', '/api/cms/events', { cookie, body: { rev: 1, items } });
    assert.equal(again.status, 200);
    assert.equal(again.data.items[0].order, 0, 'order is the list position');
    assert.ok(e.CMS.keys().some((k) => k.startsWith('history/events/')), 'previous version kept');

    // Saving the same list again changes nothing and adds no audit line.
    const noop = await call(e, 'PUT', '/api/cms/events', { cookie, body: { rev: 2, items } });
    assert.equal(noop.status, 200);

    const audit = await call(e, 'GET', '/api/cms/audit', { cookie });
    assert.equal(audit.data.items.length, 2, 'a save that changed nothing is not audited');
    assert.equal(audit.data.items[0].by, BOARD);
    assert.ok(audit.data.items[0].changes.every((c) => c.op === 'moved'), 'newest first: the reorder');
    assert.deepEqual(audit.data.items[1].changes, [{ op: 'edited', label: 'Biduur (nuut)', fields: ['name'] }]);
  });

  test('invalid events are rejected with the failing fields', async () => {
    const r = await call(env(), 'PUT', '/api/cms/events', {
      cookie: await cookieFor(BOARD),
      body: { rev: 0, items: [{ id: 'x', kind: 'once', date: '2026-02-30', start: '19:00', end: '18:00', name: { af: '', en: 'E' }, where: { af: '', en: '' }, status: 'live' }] },
    });
    assert.equal(r.status, 400);
    assert.deepEqual(r.data.errors.sort(), ['items.0.date', 'items.0.end', 'items.0.name.af'].sort());
  });

  test('a live card cannot link to a page visitors cannot open', async () => {
    const r = await call(env(), 'PUT', '/api/cms/events', {
      cookie: await cookieFor(BOARD),
      body: {
        rev: 0,
        items: [{ id: 'x', kind: 'weekly', day: 'Dinsdag', start: '19:00', end: '20:00', name: { af: 'A', en: 'A' }, where: { af: '', en: '' }, link: { pageSlug: 'pastoral-counselling', label: { af: 'Sien meer', en: 'See more' } }, status: 'live' }],
      },
    });
    assert.equal(r.status, 400);
    assert.deepEqual(r.data.errors, ['items.0.link.pageSlug']);
  });
});

describe('pages', () => {
  test('the seed draft appears once; publish, then unpublish', async () => {
    const e = env();
    const cookie = await cookieFor(BOARD);
    const list = await call(e, 'GET', '/api/cms/pages', { cookie });
    assert.deepEqual(list.data.items.map((p) => [p.slug, p.status]), [['pastoral-counselling', 'draft']]);

    const one = await call(e, 'GET', '/api/cms/pages?slug=pastoral-counselling', { cookie });
    assert.equal(one.data.live, null);
    const { status: _s, updatedBy: _b, updatedAt: _a, ...page } = one.data.page;

    const pub = await call(e, 'PUT', '/api/cms/pages', { cookie, body: { rev: one.data.rev, page, publish: true } });
    assert.equal(pub.status, 200);
    assert.equal(pub.data.page.status, 'live');
    assert.ok(e.CMS.keys().includes('pages/live/pastoral-counselling.json'));

    const off = await call(e, 'PUT', '/api/cms/pages', { cookie, body: { action: 'unpublish', slug: 'pastoral-counselling' } });
    assert.equal(off.status, 200);
    assert.ok(!e.CMS.keys().includes('pages/live/pastoral-counselling.json'));
  });

  test('a reserved slug is refused; a taken slug conflicts', async () => {
    const e = env();
    const cookie = await cookieFor(BOARD);
    const page = { slug: 'members', title: { af: 'T', en: 'T' }, eyebrow: { af: '', en: '' }, intro: { af: '', en: '' }, blocks: [] };
    const reserved = await call(e, 'PUT', '/api/cms/pages', { cookie, body: { rev: 0, page } });
    assert.equal(reserved.status, 400);
    assert.deepEqual(reserved.data.errors, ['slug']);

    const ok = await call(e, 'PUT', '/api/cms/pages', { cookie, body: { rev: 0, page: { ...page, slug: 'nuwe-bladsy' } } });
    assert.equal(ok.status, 200);
    const taken = await call(e, 'PUT', '/api/cms/pages', { cookie, body: { rev: 0, page: { ...page, slug: 'nuwe-bladsy' } } });
    assert.equal(taken.status, 409);
  });

  test('a callout button may not carry a javascript: URL', async () => {
    const page = {
      slug: 'toets',
      title: { af: 'T', en: 'T' },
      eyebrow: { af: '', en: '' },
      intro: { af: '', en: '' },
      blocks: [{ type: 'callout', heading: { af: 'H', en: 'H' }, text: { af: '', en: '' }, button: { label: { af: 'B', en: 'B' }, href: 'javascript:alert(1)' } }],
    };
    const r = await call(env(), 'PUT', '/api/cms/pages', { cookie: await cookieFor(BOARD), body: { rev: 0, page } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.data.errors, ['blocks.0.button.href']);
  });
});
