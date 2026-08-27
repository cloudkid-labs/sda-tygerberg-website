/// <reference types="@cloudflare/workers-types" />

import { jwtVerify, createRemoteJWKSet } from 'jose';

/**
 * The Zero Trust gate for the devtest preview (C-62).
 *
 * `tygerberg-sda.cloudkid.link` sits behind a Cloudflare Access self-hosted
 * application: the edge refuses every request that is not on the allow-list and
 * only forwards an authenticated one to this Worker, stamped with a signed
 * `Cf-Access-Jwt-Assertion` header. That edge gate is the whole inbound
 * control — outbound is untouched, so the Worker still reaches YouTube, R2 and
 * anywhere else it needs to (the ZTN posture is "deny inbound except the
 * allow-list, allow all outbound").
 *
 * This module is the second lock behind that gate. Access in front of the
 * hostname is not, on its own, a boundary the origin can trust: a `*.workers.dev`
 * route, a Cloudflare-internal hop, or a future config slip could deliver a
 * request to this script without it having passed Access. So the Worker
 * re-validates the assertion against the team's public keys and serves nothing
 * until it does. Cloudflare's own guidance is explicit that protecting the
 * hostname is not enough without this JWT check.
 *
 * PRODUCTION IS DELIBERATELY NOT GATED. `sdatygerberg.co.za` is a public church
 * site that must stay reachable and indexable (C-20, C-61). The guard is a
 * no-op wherever `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN` are unset, exactly the
 * "unset -> not configured -> pass through" shape the contact and LIVE-badge
 * features already use. Those two vars live only on `env.devtest`, so the same
 * Worker code gates the preview and leaves production open, with no fork.
 */
export type AccessEnv = {
  /**
   * The Access application's Audience (AUD) tag — the long hex string the
   * dashboard shows under the application, and the `aud` every assertion it
   * mints carries. Set ONLY on devtest. Not a secret (it identifies the app, it
   * does not authorise anything), so it is a plain var in wrangler.jsonc.
   *
   * Both this and `ACCESS_TEAM_DOMAIN` must be present for the guard to
   * enforce; either one missing is production's "public" configuration.
   */
  ACCESS_AUD?: string;
  /**
   * The team's Access domain, e.g. `https://<team>.cloudflareaccess.com`. Both
   * the JWKS endpoint (`/cdn-cgi/access/certs`) and the token issuer live under
   * it, so it is checked as the `iss` as well as used to fetch the keys.
   */
  ACCESS_TEAM_DOMAIN?: string;
};

/** Both vars present ⇒ this deployment enforces Access. See `AccessEnv`. */
export function accessEnforced(env: AccessEnv): boolean {
  return Boolean(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN);
}

/**
 * `createRemoteJWKSet` returns a getter that caches the fetched keys and only
 * re-fetches on an unknown `kid` (a rotation). Cache the getter itself per team
 * domain at module scope so every request in an isolate shares one set of keys
 * rather than refetching `/cdn-cgi/access/certs` each time. The map is keyed by
 * domain purely so a misconfiguration that changed it would not serve stale
 * keys; in practice it holds one entry.
 */
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function keysFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  let getter = jwks.get(teamDomain);
  if (!getter) {
    getter = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwks.set(teamDomain, getter);
  }
  return getter;
}

/** The signed assertion, from the header Access always stamps, else its cookie. */
function tokenFrom(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  // The header is the canonical origin-side signal and is present on every
  // request Access forwards, service-token calls included. The cookie is a
  // belt: a direct browser hit that carries `CF_Authorization` but, for
  // whatever edge reason, not the header, is still checked rather than bounced.
  const cookie = request.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

function deny(reason: string): Response {
  // 403, plain, never cached. The people who see this are not authenticated
  // visitors — Access would have caught them at the edge and sent them to log
  // in — but a direct-to-origin request that skipped the gate, so there is no
  // login flow to start here, only a closed door.
  return new Response(`Forbidden — ${reason}.\n`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export type AccessDecision =
  | { ok: true; identity: string | null }
  | { ok: false; response: Response };

/**
 * Validates the Cloudflare Access assertion on `request`.
 *
 * Returns `{ ok: true }` — let the request through — when this deployment does
 * not enforce Access (production) or when the assertion verifies. Returns
 * `{ ok: false, response }` — a 403 to serve as-is — when enforcement is on and
 * the token is missing, forged, expired, or minted for a different app.
 *
 * `getKey` exists for the tests: they pass a local JWKS built from a generated
 * key pair so the verification path runs without reaching Cloudflare. In the
 * Worker it is left undefined and the remote, cached team keys are used.
 */
export async function guardAccess(
  request: Request,
  env: AccessEnv,
  getKey?: Parameters<typeof jwtVerify>[1],
): Promise<AccessDecision> {
  if (!accessEnforced(env)) return { ok: true, identity: null };
  // Narrowed by accessEnforced above; assert for the type-checker.
  const teamDomain = env.ACCESS_TEAM_DOMAIN as string;
  const aud = env.ACCESS_AUD as string;

  const token = tokenFrom(request);
  if (!token) return { ok: false, response: deny('no Access token') };

  try {
    const { payload } = await jwtVerify(token, getKey ?? keysFor(teamDomain), {
      issuer: teamDomain,
      audience: aud,
    });
    // `email` for a person, `common_name` for a service token. Identity is
    // returned for logging/attribution only; the allow-list decision was already
    // made by Access — reaching here means the caller is on it.
    const identity =
      (typeof payload.email === 'string' && payload.email) ||
      (typeof payload.common_name === 'string' && payload.common_name) ||
      null;
    return { ok: true, identity };
  } catch (err) {
    return { ok: false, response: deny(err instanceof Error ? err.message : 'invalid Access token') };
  }
}
