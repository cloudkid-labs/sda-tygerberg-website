/// <reference types="@cloudflare/workers-types" />

/**
 * Google Sign-in (OIDC authorization-code flow with PKCE) for the members
 * area (/members: board mail and the CMS). Issues a signed session cookie;
 * never stores Google tokens.
 *
 * Absent secrets mean "not configured" (devtest, local dev) — never a crash.
 * See src/worker/contact.ts for the guard-ordering and logging conventions.
 */

export type AuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** HMAC key for the flow and session cookies. 48-char random via Terraform. */
  SESSION_SECRET?: string;
  /** Comma-separated personal Google addresses allowed into /members. */
  BOARD_ALLOWED_EMAILS?: string;
  /**
   * Administrators can sign in and use all Board Mail actions and sender identities.
   */
  BOARD_ADMIN_EMAILS?: string;
  /** Board Mail addresses reserved for admin use in From and recipient fields. */
  BOARD_ADMIN_ONLY_EMAILS?: string;
  /**
   * Per-sender send-as limits, `email=address[;email=address]`. Non-admins
   * may use regular MAIL_SEND_FROM addresses; a listed sender is fenced to theirs.
   * Admin-only addresses stay reserved for admins.
   */
  BOARD_SEND_AS?: string;
  /**
   * "off" switches Board mail off on this Worker (devtest): every
   * /api/mail/* route but the session check answers 404 `disabled`, and the
   * members page hides the tab. Anything else, or unset, leaves it on.
   */
  BOARD_MAIL?: string;
};

export function boardMailEnabled(env: Pick<AuthEnv, 'BOARD_MAIL'>): boolean {
  return env.BOARD_MAIL !== 'off';
}

export type SessionCheck = { ok: true; email: string } | { ok: false; outcome: 'unauthorised' | 'not-configured' };

const FLOW_COOKIE = '__Host-kerkraad_flow';
const SESSION_COOKIE = '__Host-kerkraad';
const FLOW_MINUTES = 10;
const SESSION_HOURS = 8;

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time string equality — the state check must not leak via timing. */
function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64urlEncode(new Uint8Array(digest));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function allowList(env: AuthEnv): Set<string> {
  return new Set(
    `${env.BOARD_ALLOWED_EMAILS ?? ''},${env.BOARD_ADMIN_EMAILS ?? ''}`
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Admins may sign in and use every Board Mail function. */
export function isAdmin(env: AuthEnv, email: string): boolean {
  const admins = new Set(
    (env.BOARD_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return admins.has(email.trim().toLowerCase());
}

function adminOnlyEmails(env: Pick<AuthEnv, 'BOARD_ADMIN_ONLY_EMAILS'>): Set<string> {
  return new Set(
    (env.BOARD_ADMIN_ONLY_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True for addresses that only an administrator may use in Board Mail. */
export function isAdminOnlyEmail(env: Pick<AuthEnv, 'BOARD_ADMIN_ONLY_EMAILS'>, email: string): boolean {
  return adminOnlyEmails(env).has(email.trim().toLowerCase());
}

type SendersEnv = Pick<AuthEnv, 'BOARD_SEND_AS' | 'BOARD_ADMIN_EMAILS' | 'BOARD_ADMIN_ONLY_EMAILS'> & { MAIL_SEND_FROM?: string };

export function senders(env: SendersEnv): Set<string> {
  return new Set(
    `${env.MAIL_SEND_FROM ?? ''},${env.BOARD_ADMIN_ONLY_EMAILS ?? ''}`
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * The regular role addresses one board member may send as. Unlisted non-admins
 * get all of them; admin-only identities stay out of their list. A listed
 * sender is fenced to their entry, intersected with eligible senders so a
 * stale config line can never grant more than the role list holds.
 * Fail closed: a listed sender whose entry names nothing valid may send
 * nothing, loudly, rather than everything quietly.
 */
export function allowedFrom(env: SendersEnv, email: string): string[] {
  const all = senders(env);
  if (isAdmin(env, email)) return [...all];
  const adminOnly = adminOnlyEmails(env);
  const eligible = new Set([...all].filter((address) => !adminOnly.has(address)));
  const entry = (env.BOARD_SEND_AS ?? '')
    .split(';')
    .map((s) => s.trim().toLowerCase())
    .find((s) => s.startsWith(`${email.trim().toLowerCase()}=`));
  if (!entry) return [...eligible];
  return entry
    .slice(entry.indexOf('=') + 1)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => eligible.has(s));
}

function isConfigured(env: AuthEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Signs `email` into a session-cookie value. Exported for tests. */
export async function signSession(email: string, secret: string, issuedAt = Date.now()): Promise<string> {
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ email, iat: issuedAt, exp: issuedAt + SESSION_HOURS * 3_600_000 })),
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * Verifies the session cookie: HMAC in constant time, expiry, and a re-check
 * against the current allow-list so removing a member takes effect immediately.
 */
export async function verifySession(request: Request, env: AuthEnv): Promise<SessionCheck> {
  if (!env.SESSION_SECRET) return { ok: false, outcome: 'not-configured' };
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return { ok: false, outcome: 'unauthorised' };
  const dot = raw.indexOf('.');
  if (dot < 0) return { ok: false, outcome: 'unauthorised' };
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!timingEqual(sig, await hmac(env.SESSION_SECRET, payload))) {
    return { ok: false, outcome: 'unauthorised' };
  }
  let parsed: { email?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  } catch {
    return { ok: false, outcome: 'unauthorised' };
  }
  if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
    return { ok: false, outcome: 'unauthorised' };
  }
  if (!allowList(env).has(parsed.email.toLowerCase())) {
    return { ok: false, outcome: 'unauthorised' };
  }
  return { ok: true, email: parsed.email };
}

/** GET /auth/login — starts the flow, stores state in a signed cookie. */
export async function handleAuthLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (!isConfigured(env)) return json({ ok: false, outcome: 'not-configured' }, 503);
  const origin = new URL(request.url).origin;
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(64);
  const flow = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ state, nonce, verifier })),
  );
  const signed = `${flow}.${await hmac(env.SESSION_SECRET!, flow)}`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie':
        `${FLOW_COOKIE}=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${FLOW_MINUTES * 60}`,
      'Cache-Control': 'no-store',
    },
  });
}

type IdClaims = { iss?: unknown; aud?: unknown; exp?: unknown; nonce?: unknown; email?: unknown; email_verified?: unknown };

/** GET /auth/callback — finishes the flow, sets the session, redirects home. */
export async function handleAuthCallback(request: Request, env: AuthEnv): Promise<Response> {
  if (!isConfigured(env)) return json({ ok: false, outcome: 'not-configured' }, 503);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const raw = getCookie(request, FLOW_COOKIE);
  const clearFlow =
    `${FLOW_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (!code || !state || !raw) return json({ ok: false, outcome: 'invalid', errors: ['state'] }, 400);

  const dot = raw.indexOf('.');
  if (dot < 0) return json({ ok: false, outcome: 'invalid', errors: ['state'] }, 400);
  const flow = raw.slice(0, dot);
  if (!timingEqual(raw.slice(dot + 1), await hmac(env.SESSION_SECRET!, flow))) {
    return json({ ok: false, outcome: 'invalid', errors: ['state'] }, 400);
  }
  let saved: { state?: unknown; nonce?: unknown; verifier?: unknown };
  try {
    saved = JSON.parse(new TextDecoder().decode(b64urlDecode(flow)));
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['state'] }, 400);
  }
  if (typeof saved.state !== 'string' || !timingEqual(state, saved.state)) {
    return json({ ok: false, outcome: 'invalid', errors: ['state'] }, 400);
  }

  let token: { id_token?: unknown };
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${url.origin}/auth/callback`,
        code_verifier: String(saved.verifier),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return json({ ok: false, outcome: 'invalid', errors: ['exchange'] }, 502);
    token = await res.json();
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['exchange'] }, 502);
  }
  if (typeof token.id_token !== 'string') {
    return json({ ok: false, outcome: 'invalid', errors: ['token'] }, 502);
  }

  // The token arrives directly from Google's token endpoint over TLS, so the
  // signature check that a third-party token would need is skipped here —
  // OpenID Connect Core allows this, and it avoids a `jose` dependency.
  let claims: IdClaims;
  try {
    const parts = token.id_token.split('.');
    if (parts.length !== 3) throw new Error('segments');
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['token'] }, 502);
  }
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (
    claims.iss !== 'https://accounts.google.com' ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < Date.now() ||
    typeof saved.nonce !== 'string' ||
    claims.nonce !== saved.nonce ||
    claims.email_verified !== true ||
    !email ||
    !allowList(env).has(email)
  ) {
    // One status for every rejection: valid session or nothing to learn.
    const headers = { 'Set-Cookie': clearFlow, 'Cache-Control': 'no-store' };
    // The 403 page says why and who can fix it (C-70).
    return new Response(null, { status: 303, headers: { ...headers, Location: '/no-access/' } });
  }

  const session = await signSession(email, env.SESSION_SECRET!);
  // Two Set-Cookie headers, never one folded line: RFC 6265 forbids folding
  // and browsers keep only the first cookie in a folded header — which used
  // to cost exactly the session this response exists to set.
  const headers = new Headers({
    Location: '/members/',
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', clearFlow);
  headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`,
  );
  return new Response(null, { status: 303, headers });
}

/**
 * Whether the request carries a session cookie at all, valid or not. Lets the
 * members gate tell "never signed in" (send to /login) from "signed in but not
 * on the list, or expired" (403) — C-70.
 */
export function hasSessionCookie(request: Request): boolean {
  return getCookie(request, SESSION_COOKIE) !== null;
}

/** POST /auth/logout — clears the session cookie. */
export async function handleAuthLogout(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}

/** GET /api/mail/session — the page's "who am I" check. */
export async function handleMailSession(request: Request, env: AuthEnv): Promise<Response> {
  const check = await verifySession(request, env);
  if (!check.ok) return json({ ok: false, outcome: check.outcome }, check.outcome === 'not-configured' ? 503 : 401);
  if (!boardMailEnabled(env)) return json({ ok: true, email: check.email, mail: false, admin: isAdmin(env, check.email) }, 200);
  return json({ ok: true, email: check.email, mail: true, admin: isAdmin(env, check.email), allowedFrom: allowedFrom(env, check.email) }, 200);
}
