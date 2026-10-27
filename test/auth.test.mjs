import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import {
  handleAuthCallback,
  handleAuthLogin,
  handleMailSession,
  signSession,
} from '../src/worker/auth.ts';

/*
 * Google sign-in for /kerkraad: login starts the PKCE flow, the callback
 * finishes it and sets the session, the session check gates every API call.
 * One status for every rejection — valid session or nothing to learn.
 */

const SECRET = 'test-session-secret';
const CLIENT = '123-test.apps.googleusercontent.com';

const env = (over = {}) => ({
  GOOGLE_CLIENT_ID: CLIENT,
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: 'boss@example.co.za,pa@example.co.za',
  ...over,
});

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const idToken = (claims) => `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`;

const goodClaims = (over = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce: 'NONCE',
  email: 'boss@example.co.za',
  email_verified: true,
  ...over,
});

const realFetch = globalThis.fetch;
let tokenCalls;

function mockToken(claims) {
  tokenCalls = [];
  globalThis.fetch = async (url, init) => {
    tokenCalls.push(String(url));
    return Response.json({ id_token: idToken(claims) });
  };
}

function flowCookieFrom(loginRes) {
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0].split('=')[1];
}

function flowPayload(raw) {
  return JSON.parse(Buffer.from(raw.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

beforeEach(() => {
  tokenCalls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('handleAuthLogin', () => {
  test('unconfigured without secrets', async () => {
    const res = await handleAuthLogin(new Request('https://x/auth/login'), {});
    assert.equal(res.status, 503);
    assert.equal((await res.json()).outcome, 'not-configured');
  });

  test('redirects to Google with PKCE S256 and sets the flow cookie', async () => {
    const res = await handleAuthLogin(new Request('https://x/auth/login'), env());
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.get('location'));
    assert.equal(loc.hostname, 'accounts.google.com');
    assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(loc.searchParams.get('scope'), 'openid email');
    assert.match(res.headers.get('set-cookie') ?? '', /__Host-kerkraad_flow=/);
  });
});

describe('handleAuthCallback', () => {
  test('rejects a state mismatch', async () => {
    mockToken(goodClaims());
    const login = await handleAuthLogin(new Request('https://x/auth/login'), env());
    const cookie = flowCookieFrom(login);
    const res = await handleAuthCallback(
      new Request('https://x/auth/callback?code=abc&state=wrong', {
        headers: { cookie: `__Host-kerkraad_flow=${cookie}` },
      }),
      env(),
    );
    assert.equal(res.status, 400);
    assert.equal(tokenCalls.length, 0);
  });

  test('rejects a tampered flow cookie without calling Google', async () => {
    mockToken(goodClaims());
    const login = await handleAuthLogin(new Request('https://x/auth/login'), env());
    const cookie = flowCookieFrom(login) + 'tampered';
    const res = await handleAuthCallback(
      new Request('https://x/auth/callback?code=abc&state=s', {
        headers: { cookie: `__Host-kerkraad_flow=${cookie}` },
      }),
      env(),
    );
    assert.equal(res.status, 400);
    assert.equal(tokenCalls.length, 0);
  });

  async function callbackWith(claims, listOver) {
    mockToken(claims);
    const login = await handleAuthLogin(new Request('https://x/auth/login'), env());
    const cookie = flowCookieFrom(login);
    const { state } = flowPayload(cookie);
    const e = listOver ? env(listOver) : env();
    // Nonce lives in the signed cookie; mirror it into the token under test.
    if (claims.nonce === 'NONCE') {
      const { nonce } = flowPayload(cookie);
      mockToken({ ...goodClaims(), ...claims, nonce });
    }
    return handleAuthCallback(
      new Request(`https://x/auth/callback?code=abc&state=${state}`, {
        headers: { cookie: `__Host-kerkraad_flow=${cookie}` },
      }),
      e,
    );
  }

  test('success sets the session and redirects to /kerkraad/', async () => {
    const res = await callbackWith(goodClaims());
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/kerkraad/');
    // Two separate headers: a folded Set-Cookie line costs the session in
    // every browser, while get('set-cookie') would still match.
    const cookies = res.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies.find((c) => c.startsWith('__Host-kerkraad=')) ?? '', /Max-Age=28800/);
  });

  for (const [name, claims] of [
    ['wrong aud', { aud: 'other.apps.googleusercontent.com' }],
    ['unverified email', { email_verified: false }],
    ['unlisted address', { email: 'stranger@example.co.za' }],
  ]) {
    test(`forbidden redirect on ${name}`, async () => {
      const res = await callbackWith(goodClaims(claims));
      assert.equal(res.status, 303);
      assert.match(res.headers.get('location') ?? '', /forbidden/);
    });
  }

  test('uppercase allow-list address signs in', async () => {
    const res = await callbackWith(goodClaims({ email: 'BOSS@example.co.za' }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/kerkraad/');
  });
});

describe('handleMailSession', () => {
  test('401 without a session, 503 without secrets', async () => {
    const noCookie = await handleMailSession(new Request('https://x/api/mail/session'), env());
    assert.equal(noCookie.status, 401);
    const noSecrets = await handleMailSession(new Request('https://x/api/mail/session'), {});
    assert.equal(noSecrets.status, 503);
  });

  test('200 with the email for a valid session', async () => {
    const session = await signSession('boss@example.co.za', SECRET);
    const res = await handleMailSession(
      new Request('https://x/api/mail/session', {
        headers: { cookie: `__Host-kerkraad=${session}` },
      }),
      env(),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).email, 'boss@example.co.za');
  });

  test('401 on expired, tampered, or delisted sessions', async () => {
    const expired = await signSession('boss@example.co.za', SECRET, Date.now() - 9 * 3600_000);
    for (const cookie of [
      expired,
      `${(await signSession('boss@example.co.za', SECRET)).slice(0, -2)}xx`,
      'not-a-session',
    ]) {
      const res = await handleMailSession(
        new Request('https://x/api/mail/session', {
          headers: { cookie: `__Host-kerkraad=${cookie}` },
        }),
        env(),
      );
      assert.equal(res.status, 401, cookie.slice(0, 20));
    }
    // Removed from the list mid-session: the next call fails.
    const valid = await signSession('boss@example.co.za', SECRET);
    const delisted = await handleMailSession(
      new Request('https://x/api/mail/session', {
        headers: { cookie: `__Host-kerkraad=${valid}` },
      }),
      env({ BOARD_ALLOWED_EMAILS: 'pa@example.co.za' }),
    );
    assert.equal(delisted.status, 401);
  });
});
