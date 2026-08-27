import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { guardAccess, accessEnforced } from '../src/worker/accessGuard.ts';

/**
 * The guard verifies a real RS256 signature, so the tests mint real tokens.
 * A key pair is generated once, its public half exported as a one-key JWKS,
 * and that set is passed to `guardAccess` as its injected `getKey` — the same
 * shape `createRemoteJWKSet` returns, but served from memory so nothing here
 * reaches `*.cloudflareaccess.com`.
 */
const TEAM = 'https://tygerberg.cloudflareaccess.com';
const AUD = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const KID = 'test-key-1';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256', kid: KID }] });

/** A signed assertion of the shape Cloudflare Access mints. */
function token({ aud = AUD, iss = TEAM, email, commonName, expiresIn = '2h', notBefore } = {}) {
  const claims = {};
  if (email) claims.email = email;
  if (commonName) claims.common_name = commonName;
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(iss)
    .setAudience(aud)
    .setExpirationTime(expiresIn);
  if (notBefore) jwt = jwt.setNotBefore(notBefore);
  return jwt.sign(privateKey);
}

/** A request to the preview, optionally carrying the assertion header/cookie. */
function req({ header, cookie } = {}) {
  const headers = new Headers();
  if (header) headers.set('cf-access-jwt-assertion', header);
  if (cookie) headers.set('cookie', cookie);
  return new Request('https://tygerberg-sda.cloudkid.link/', { headers });
}

const GATED = { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM };

describe('accessEnforced', () => {
  test('true only when both vars are set', () => {
    assert.equal(accessEnforced(GATED), true);
    assert.equal(accessEnforced({ ACCESS_AUD: AUD }), false);
    assert.equal(accessEnforced({ ACCESS_TEAM_DOMAIN: TEAM }), false);
    assert.equal(accessEnforced({}), false);
  });
});

describe('guardAccess — production (unset) passes through', () => {
  test('no vars: allowed without any token, and the JWKS is never consulted', async () => {
    const decision = await guardAccess(req(), {}, () => {
      throw new Error('verification must not run when Access is not enforced');
    });
    assert.deepEqual(decision, { ok: true, identity: null });
  });
});

describe('guardAccess — devtest (gated)', () => {
  test('a valid user token passes and surfaces the email', async () => {
    const decision = await guardAccess(req({ header: await token({ email: 'her@example.com' }) }), GATED, jwks);
    assert.equal(decision.ok, true);
    assert.equal(decision.identity, 'her@example.com');
  });

  test('a valid service-token assertion passes and surfaces the common_name', async () => {
    const decision = await guardAccess(
      req({ header: await token({ commonName: 'devtest-ci-smoke' }) }),
      GATED,
      jwks,
    );
    assert.equal(decision.ok, true);
    assert.equal(decision.identity, 'devtest-ci-smoke');
  });

  test('the CF_Authorization cookie is accepted when the header is absent', async () => {
    const jwt = await token({ email: 'her@example.com' });
    const decision = await guardAccess(req({ cookie: `CF_Authorization=${jwt}; other=1` }), GATED, jwks);
    assert.equal(decision.ok, true);
    assert.equal(decision.identity, 'her@example.com');
  });

  test('no token is a 403', async () => {
    const decision = await guardAccess(req(), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
    assert.equal(decision.response.headers.get('cache-control'), 'no-store');
  });

  test('a token minted for a different application (wrong aud) is a 403', async () => {
    const wrong = await token({ email: 'her@example.com', aud: 'f'.repeat(64) });
    const decision = await guardAccess(req({ header: wrong }), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
  });

  test('a token from a different team (wrong iss) is a 403', async () => {
    const wrong = await token({ email: 'her@example.com', iss: 'https://someone-else.cloudflareaccess.com' });
    const decision = await guardAccess(req({ header: wrong }), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
  });

  test('an expired token is a 403', async () => {
    // Issued and expired in the past: exp two hours before iat.
    const expired = await new SignJWT({ email: 'her@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    const decision = await guardAccess(req({ header: expired }), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
  });

  test('a garbage token is a 403, not a throw', async () => {
    const decision = await guardAccess(req({ header: 'not.a.jwt' }), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
  });

  test('a token signed by an unknown key is a 403', async () => {
    const { privateKey: attacker } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: 'her@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt()
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime('2h')
      .sign(attacker);
    const decision = await guardAccess(req({ header: forged }), GATED, jwks);
    assert.equal(decision.ok, false);
    assert.equal(decision.response.status, 403);
  });
});
