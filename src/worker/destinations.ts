/// <reference types="@cloudflare/workers-types" />

import { isSuperAdmin, type AuthEnv } from './auth';
import { audit, readJson, writeJson } from './cmsStore';
import { isEmail, normEmail } from '../lib/mailSettings';

/**
 * Destination addresses, managed from Settings → Email settings (C-72).
 *
 * Cloudflare delivers mail only to an address verified on the account. A
 * SuperAdmin adds one here; the Worker asks Cloudflare's API to create it and
 * Cloudflare emails the owner a confirmation link. Once verified it can be an
 * inbound route's target straight away — forwarding needs nothing more.
 * Notifications still need it in MAIL_DESTINATIONS and the send_email fence,
 * which only a deploy changes (option 1 in C-72): the fence stays the bound
 * on what a bug in the Worker could mail.
 *
 * Destination addresses belong to the whole Cloudflare account, so the token
 * could reach other projects' addresses. Only manageable addresses (not
 * MAIL_DESTINATIONS_HIDDEN, not the church domain) are listed, added or
 * removed, and an address still in use — deploy config or saved settings —
 * is never removed.
 */

export type DestinationsEnv = AuthEnv & {
  CMS?: R2Bucket;
  MAIL_DESTINATIONS?: string;
  /** Account addresses this page never shows, adds or offers (comma-separated). */
  MAIL_DESTINATIONS_HIDDEN?: string;
  CONTACT_EMAIL_FROM?: string;
  /** Secret: an API token with Email Routing Addresses Write on the account. */
  EMAIL_ROUTING_API_TOKEN?: string;
  /** Secret: the Cloudflare account the addresses belong to. */
  EMAIL_ROUTING_ACCOUNT_ID?: string;
};

/** `id`: Cloudflare's identifier, used to delete; never sent to the page. */
export type Destination = { email: string; verified: boolean; id?: string };

/** The verified addresses last seen, for routing between page loads. */
export const VERIFIED_KEY = 'settings/destinations.json';
type VerifiedDoc = { verified: string[]; checkedAt: string };
/** Who added what, when: the rate limit's memory. */
export const ADDS_KEY = 'settings/destination-adds.json';
type AddsDoc = { adds: { at: string; by: string; email: string }[] };

/** Each add makes Cloudflare email a stranger; at most this many a day. */
export const ADD_LIMIT = 5;
export const ADD_WINDOW_MS = 24 * 60 * 60 * 1000;

const API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const MAX_PAGES = 5;

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);

export const destinationsConfigured = (env: DestinationsEnv) =>
  Boolean(env.EMAIL_ROUTING_API_TOKEN && env.EMAIL_ROUTING_ACCOUNT_ID && ACCOUNT_ID.test(env.EMAIL_ROUTING_ACCOUNT_ID));

const hidden = (env: DestinationsEnv) => new Set(list(env.MAIL_DESTINATIONS_HIDDEN));
const domain = (env: DestinationsEnv) => normEmail(env.CONTACT_EMAIL_FROM).split('@')[1] || 'sdatygerberg.co.za';

/**
 * May this address be managed here? Not hidden, and not on the church domain:
 * a church address as a destination would loop mail back through the Worker.
 */
export function manageable(env: DestinationsEnv, email: string): boolean {
  return isEmail(email) && !hidden(env).has(email) && !email.endsWith(`@${domain(env)}`);
}

type CfResult<T> = { ok: true; result: T; info?: { total_pages?: number } } | { ok: false; status: number; codes: number[] };

async function cf<T>(env: DestinationsEnv, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<CfResult<T>> {
  try {
    const res = await fetch(`${API}/accounts/${env.EMAIL_ROUTING_ACCOUNT_ID}/email/routing/addresses${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.EMAIL_ROUTING_API_TOKEN}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      result?: T;
      result_info?: { total_pages?: number };
      errors?: { code?: number }[];
    } | null;
    if (res.ok && data?.success && data.result !== undefined) return { ok: true, result: data.result, info: data.result_info };
    // Codes only: Cloudflare's messages can echo the request.
    const codes = (data?.errors ?? []).map((e) => Number(e.code)).filter(Number.isFinite);
    console.error(`destinations: Cloudflare ${method} FAILED status=${res.status} codes=${codes.join(',')}`);
    return { ok: false, status: res.status, codes };
  } catch {
    console.error(`destinations: Cloudflare ${method} FAILED (network)`);
    return { ok: false, status: 0, codes: [] };
  }
}

/** Every destination address on the account, or null when Cloudflare fails. */
export async function listDestinations(env: DestinationsEnv): Promise<Destination[] | null> {
  if (!destinationsConfigured(env)) return null;
  const all: Destination[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await cf<{ email?: string; verified?: string | null; id?: string }[]>(env, 'GET', `?per_page=50&page=${page}`);
    if (!r.ok) return null;
    for (const a of r.result) {
      const email = normEmail(a.email);
      if (email) all.push({ email, verified: Boolean(a.verified), ...(typeof a.id === 'string' ? { id: a.id } : {}) });
    }
    if (r.result.length < 50 || page >= (r.info?.total_pages ?? page)) break;
  }
  return all;
}

export async function readVerified(bucket: R2Bucket | undefined): Promise<string[]> {
  if (!bucket) return [];
  try {
    const hit = await readJson<VerifiedDoc>(bucket, VERIFIED_KEY);
    return Array.isArray(hit?.value.verified) ? hit.value.verified.map(normEmail).filter(Boolean) : [];
  } catch {
    console.error('destinations: verified read FAILED');
    return [];
  }
}

/** The manageable, verified addresses in a Cloudflare listing. */
export const verifiedOf = (env: DestinationsEnv, all: Destination[]) =>
  [...new Set(all.filter((d) => d.verified && manageable(env, d.email)).map((d) => d.email))].sort();

/** Stores what Cloudflare just said is verified, when it changed. */
async function remember(bucket: R2Bucket, verified: string[]): Promise<void> {
  const before = await readVerified(bucket);
  if (before.join() === verified.join()) return;
  // Last writer wins: every writer stores what Cloudflare said at that moment.
  if (!(await writeJson(bucket, VERIFIED_KEY, { verified, checkedAt: new Date().toISOString() }, null))) {
    console.error('destinations: verified write FAILED');
  }
}

/**
 * The verified addresses inbound routes may use: fresh from Cloudflare (and
 * remembered) when it answers, else the last ones remembered.
 */
export async function currentVerified(env: DestinationsEnv, bucket: R2Bucket): Promise<string[]> {
  const all = await listDestinations(env);
  if (!all) return readVerified(bucket);
  const verified = verifiedOf(env, all);
  await remember(bucket, verified);
  return verified;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function view(env: DestinationsEnv, bucket: R2Bucket, all: Destination[], inUse: Set<string>) {
  const fenced = new Set(list(env.MAIL_DESTINATIONS));
  await remember(bucket, verifiedOf(env, all));
  const adds = await readJson<AddsDoc>(bucket, ADDS_KEY);
  const since = Date.now() - ADD_WINDOW_MS;
  const recent = (adds?.value.adds ?? []).filter((a) => Date.parse(a.at) > since).length;
  return {
    ok: true,
    configured: true,
    items: all
      .filter((d) => manageable(env, d.email))
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((d) => ({ email: d.email, verified: d.verified, notify: fenced.has(d.email), inUse: inUse.has(d.email) })),
    remaining: Math.max(0, ADD_LIMIT - recent),
  };
}

/**
 * GET/POST/DELETE /api/cms/destinations — SuperAdmins only. GET lists the
 * account's manageable destination addresses with their verification state;
 * POST `{ email }` creates one (Cloudflare then emails its confirmation link),
 * rate-limited and audited; DELETE `{ email }` removes one that nothing uses,
 * audited. `inUse` names every address the deploy config or saved settings
 * deliver to.
 */
export async function destinationsRoute(
  request: Request,
  env: DestinationsEnv,
  g: { email: string; bucket: R2Bucket },
  body: () => Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }>,
  inUse: () => Promise<Set<string>>,
): Promise<Response> {
  if (!isSuperAdmin(env, g.email)) return json({ ok: false, outcome: 'forbidden' }, 403);
  if (!destinationsConfigured(env)) return json({ ok: true, configured: false, items: [], remaining: 0 }, 200);
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);

  if (request.method === 'GET') {
    const all = await listDestinations(env);
    return all ? json(await view(env, g.bucket, all, await inUse()), 200) : json({ ok: false, outcome: 'upstream' }, 502);
  }

  if (request.method === 'DELETE') {
    const read = await body();
    if (!read.ok) return read.response;
    const email = normEmail(read.body.email);
    if (!manageable(env, email)) return json({ ok: false, outcome: 'invalid', errors: ['email'] }, 400);
    // Still delivered to: removing it would bounce mail or fail a send.
    if ((await inUse()).has(email)) return json({ ok: false, outcome: 'in-use' }, 409);
    const all = await listDestinations(env);
    if (!all) return json({ ok: false, outcome: 'upstream' }, 502);
    const hit = all.find((d) => d.email === email);
    if (!hit) return json({ ok: false, outcome: 'not-found' }, 404);
    if (!hit.id || !ACCOUNT_ID.test(hit.id)) return json({ ok: false, outcome: 'upstream' }, 502);
    const removed = await cf<unknown>(env, 'DELETE', `/${hit.id}`);
    if (!removed.ok) return json({ ok: false, outcome: 'upstream' }, 502);
    await audit(g.bucket, { by: g.email, action: 'destination.remove', target: 'destinations', changes: [{ op: 'removed', label: email }] });
    const after = (await listDestinations(env)) ?? all.filter((d) => d.email !== email);
    return json(await view(env, g.bucket, after, await inUse()), 200);
  }

  const read = await body();
  if (!read.ok) return read.response;
  const email = normEmail(read.body.email);
  if (!manageable(env, email)) return json({ ok: false, outcome: 'invalid', errors: ['email'] }, 400);
  const all = await listDestinations(env);
  if (!all) return json({ ok: false, outcome: 'upstream' }, 502);
  if (all.some((d) => d.email === email)) return json({ ok: false, outcome: 'exists' }, 409);

  // Reserve the slot before asking Cloudflare, so concurrent adds cannot
  // slip past the limit; a failed create still spends it.
  const hit = await readJson<AddsDoc>(g.bucket, ADDS_KEY);
  const now = Date.now();
  const recent = (hit?.value.adds ?? []).filter((a) => Date.parse(a.at) > now - ADD_WINDOW_MS);
  if (recent.length >= ADD_LIMIT) {
    const oldest = Math.min(...recent.map((a) => Date.parse(a.at)));
    return json({ ok: false, outcome: 'rate-limited', retryAt: new Date(oldest + ADD_WINDOW_MS).toISOString() }, 429);
  }
  const doc: AddsDoc = { adds: [...recent, { at: new Date(now).toISOString(), by: g.email, email }] };
  if (!(await writeJson(g.bucket, ADDS_KEY, doc, hit?.etag ?? null))) return json({ ok: false, outcome: 'conflict' }, 409);

  const created = await cf<{ email?: string; verified?: string | null }>(env, 'POST', '', { email });
  if (!created.ok) return json({ ok: false, outcome: 'upstream' }, 502);
  await audit(g.bucket, { by: g.email, action: 'destination.add', target: 'destinations', changes: [{ op: 'added', label: email }] });
  const after = (await listDestinations(env)) ?? [...all, { email, verified: Boolean(created.result.verified) }];
  return json(await view(env, g.bucket, after, await inUse()), 200);
}
