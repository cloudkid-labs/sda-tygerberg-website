import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { signSession } from '../src/worker/auth.ts';

/*
 * The members area is reachable only by a signed-in board member (C-70). The
 * HTML is gated in the Worker as well as every API behind it.
 */

globalThis.caches ??= { default: { async match() {}, async put() {} } };
const { default: worker } = await import('../src/worker/index.ts');

const SECRET = 'test-session-secret';
const BOARD = 'boss@example.co.za';

const env = (over = {}) => ({
  GOOGLE_CLIENT_ID: '123-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: BOARD,
  ASSETS: {
    async fetch(req) {
      const { pathname } = new URL(req.url);
      return new Response(`page:${pathname}`, { headers: { 'Content-Type': 'text/html' } });
    },
  },
  ...over,
});
const ctx = { waitUntil() {} };

const get = async (path, cookie, e = env()) =>
  worker.fetch(new Request(`https://x${path}`, { headers: cookie ? { cookie } : {} }), e, ctx);

const sessionFor = async (email) => `__Host-kerkraad=${await signSession(email, SECRET)}`;

describe('/members gate', () => {
  for (const path of ['/members', '/members/', '/members/?tab=content&section=pages']) {
    test(`${path}: a board member gets the page, uncached`, async () => {
      const res = await get(path, await sessionFor(BOARD));
      assert.equal(res.status, 200);
      assert.match(await res.text(), /^page:\/members/);
      assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    });

    test(`${path}: a signed-in non-member gets 403, never the page`, async () => {
      const res = await get(path, await sessionFor('stranger@example.co.za'));
      assert.equal(res.status, 403);
      assert.equal(await res.text(), 'page:/no-access/');
    });

    test(`${path}: no session goes to /login/`, async () => {
      const res = await get(path);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login/');
    });
  }

  test('a member removed from the list loses the page at once', async () => {
    const cookie = await sessionFor(BOARD);
    const res = await get('/members/', cookie, env({ BOARD_ALLOWED_EMAILS: 'someone@else.co.za' }));
    assert.equal(res.status, 403);
  });

  test('a tampered cookie is a 403', async () => {
    const res = await get('/members/', `__Host-kerkraad=${(await signSession(BOARD, 'other-secret'))}`);
    assert.equal(res.status, 403);
  });

  test('without sign-in configured, /members sends to /login/', async () => {
    const res = await get('/members/', await sessionFor(BOARD), env({ SESSION_SECRET: undefined }));
    assert.equal(res.status, 302);
  });

  test('/no-access/ answers 403', async () => {
    const res = await get('/no-access/');
    assert.equal(res.status, 403);
  });
});

describe('/kerkraad is the old address', () => {
  test('redirects permanently to /members/, keeping the message link', async () => {
    const res = await get('/kerkraad/?msg=abc123');
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/members/?msg=abc123');
  });

  test('without a trailing slash too', async () => {
    const res = await get('/kerkraad');
    assert.equal(res.headers.get('location'), '/members/');
  });
});
