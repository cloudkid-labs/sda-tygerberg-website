/// <reference types="@cloudflare/workers-types" />

import { verifySession, isAdmin, isAdminOnlyEmail, allowedFrom, senders, type AuthEnv } from './auth';
import { sendViaBrevo, storeSent, type MailSendEnv, type SentItem } from './mailSend';
import { mailHtml, LOGO_REMOTE_URL } from './signature';

export type InboxEnv = AuthEnv &
  MailSendEnv & {
    SUBMISSIONS?: R2Bucket;
  };

export type SubmissionReply = { by: string; at: string; body?: string };
export type Submission = {
  id: string;
  submittedAt: string;
  topic: string;
  name: string;
  email: string | null;
  phone: string | null;
  lang: string;
  message: string;
  subject?: string;
  replyFrom?: string;
  replies: SubmissionReply[];
  trashedAt?: string;
};

/** Visitor-facing enquiries always answer as the public role address. */
const TOPIC_FROM: Record<string, string> = {
  connect: 'welkom@sdatygerberg.co.za',
  'bible-study': 'welkom@sdatygerberg.co.za',
};

const MAX_BODY_BYTES = 16 * 1024;
const MAX_LIST = 100;
const MAX_REPLY_CHARS = 10_000;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isAdminOnlySubmission(env: InboxEnv, sessionEmail: string, item: Submission): boolean {
  return !isAdmin(env, sessionEmail) &&
    (isAdminOnlyEmail(env, item.replyFrom ?? '') || isAdminOnlyEmail(env, item.email ?? ''));
}

function isAdminOnlySentItem(env: InboxEnv, sessionEmail: string, item: SentItem): boolean {
  return !isAdmin(env, sessionEmail) &&
    (isAdminOnlyEmail(env, item.from) || (item.to ?? []).some((address) => isAdminOnlyEmail(env, address)));
}

/**
 * R2 keys carry an ISO timestamp prefix, so the stable thread id is the
 * suffix. One lookup for message, reply and delete — three copies already
 * disagreed once.
 */
async function findSubmissionKey(env: InboxEnv, id: string): Promise<string | null> {
  if (!id || id.includes('/') || id.includes('..')) return null;
  if (!env.SUBMISSIONS) return null;
  const listed = await env.SUBMISSIONS.list({ prefix: 'submissions/', limit: 1000 });
  return listed.objects.map((o) => o.key).find((k) => k.endsWith(`-${id}.json`)) ?? null;
}

/**
 * Finds a stored item by id across both the inbox and sent prefixes — used by
 * trash and permanent delete so either kind of mail can be addressed by id.
 */
async function findObjectKey(env: InboxEnv, id: string): Promise<string | null> {
  if (!id || id.includes('/') || id.includes('..')) return null;
  if (!env.SUBMISSIONS) return null;
  for (const prefix of ['submissions/', 'sent/']) {
    const listed = await env.SUBMISSIONS.list({ prefix, limit: 1000 });
    const hit = listed.objects.map((o) => o.key).find((k) => k.endsWith(`-${id}.json`));
    if (hit) return hit;
  }
  return null;
}

/**
 * Lists the newest submissions first. Keys sort oldest-first (ISO timestamp
 * prefix), so the Worker reverses after a bounded list — R2 has no desc.
 */
export async function handleInboxList(request: Request, env: InboxEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);

  const listed = await env.SUBMISSIONS.list({ limit: MAX_LIST, prefix: 'submissions/' });
  const keys = listed.objects.map((o) => o.key).reverse();
  const trashedOnly = new URL(request.url).searchParams.get('trashed') === '1';
  const items: Omit<Submission, 'message'>[] = [];
  for (const key of keys) {
    const obj = await env.SUBMISSIONS.get(key);
    if (!obj) continue;
    try {
      const s = (await obj.json()) as Submission;
      const { message: _omitted, ...summary } = s;
      if (trashedOnly !== Boolean(s.trashedAt)) continue;
      if (isAdminOnlySubmission(env, session.email, s)) continue;
      items.push(summary);
    } catch {
      // A stray object is skipped, never fatal — the log says which key.
      console.error(`inbox: unreadable object skipped key=${key}`);
    }
  }
  console.log(`inbox: list count=${items.length} trashed=${trashedOnly} by=${session.email}`);
  return json({ ok: true, items }, 200);
}

/**
 * PUT /api/mail/trash?id= — soft-deletes the thread by stamping trashedAt;
 * with `&restore=1`, clears the stamp instead. Admin only, like permanent
 * delete. The copy stays in R2 until permanent delete removes it.
 */
export async function handleInboxTrash(request: Request, env: InboxEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);
  if (!isAdmin(env, session.email)) {
    return json({ ok: false, outcome: 'forbidden' }, 403);
  }
  if (request.method !== 'PUT') {
    return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  }
  const id = str(new URL(request.url).searchParams.get('id'));
  const restore = new URL(request.url).searchParams.get('restore') === '1';
  if (!id || id.includes('/') || id.includes('..')) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 400);
  }
  const key = await findObjectKey(env, id);
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const obj = await env.SUBMISSIONS.get(key);
  if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const item = (await obj.json()) as Submission;
  item.trashedAt = restore ? undefined : new Date().toISOString();
  await env.SUBMISSIONS.put(key, JSON.stringify(item));
  console.log(`inbox: ${restore ? 'restored' : 'trashed'} key=${key} by=${session.email}`);
  return json({ ok: true }, 200);
}

/** GET /api/mail/message?id= — one full thread, message included. */
export async function handleInboxMessage(request: Request, env: InboxEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);

  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);

  const id = str(new URL(request.url).searchParams.get('id'));
  const key = await findSubmissionKey(env, id);
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, !id || id.includes('/') || id.includes('..') ? 400 : 404);
  const obj = await env.SUBMISSIONS!.get(key);
  if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const item = (await obj.json()) as Submission;
  if (isAdminOnlySubmission(env, session.email, item)) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  }
  console.log(`inbox: read by=${session.email}`);
  return json({ ok: true, item }, 200);
}

/**
 * DELETE /api/mail/message?id= — removes the thread from R2. Admin list only:
 * everyone else gets 403, signed out or not, so the endpoint leaks nothing
 * about which ids exist.
 */
export async function handleInboxDelete(request: Request, env: InboxEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);
  if (!isAdmin(env, session.email)) {
    return json({ ok: false, outcome: 'forbidden' }, 403);
  }
  const id = str(new URL(request.url).searchParams.get('id'));
  if (!id || id.includes('/') || id.includes('..')) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 400);
  }
  const key = await findObjectKey(env, id);
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  await env.SUBMISSIONS.delete(key);
  console.log(`inbox: deleted key=${key} by=${session.email}`);
  return json({ ok: true }, 200);
}

/**
 * GET /api/mail/sent — the Sent box. Without `id`, newest-first summaries
 * (bodies omitted); with `?id=`, the full stored item. Session-gated like the
 * inbox; every send is recorded by storeSent, so this is the complete
 * outbound history next to the inbox's inbound one.
 */
export async function handleInboxSent(request: Request, env: InboxEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS) return json({ ok: false, outcome: 'not-configured' }, 503);

  const id = str(new URL(request.url).searchParams.get('id'));
  const listed = await env.SUBMISSIONS.list({ prefix: 'sent/', limit: 1000 });
  const keys = listed.objects.map((o) => o.key).reverse();
  const trashedOnly = new URL(request.url).searchParams.get('trashed') === '1';
  if (id) {
    if (id.includes('/') || id.includes('..')) {
      return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 400);
    }
    const key = keys.find((k) => k.endsWith(`-${id}.json`));
    if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
    const obj = await env.SUBMISSIONS.get(key);
    if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
    const item = (await obj.json()) as SentItem;
    if (trashedOnly !== Boolean(item.trashedAt) || isAdminOnlySentItem(env, session.email, item)) {
      return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
    }
    return json({ ok: true, item }, 200);
  }
  const items: Omit<SentItem, 'body'>[] = [];
  for (const key of keys) {
    const obj = await env.SUBMISSIONS.get(key);
    if (!obj) continue;
    try {
      const s = (await obj.json()) as SentItem;
      if (trashedOnly !== Boolean(s.trashedAt) || isAdminOnlySentItem(env, session.email, s)) continue;
      const { body: _omitted, ...summary } = s;
      items.push(summary);
    } catch {
      console.error(`inbox: unreadable sent object skipped key=${key}`);
    }
  }
  return json({ ok: true, items }, 200);
}

/**
 * POST /api/mail/reply { id, body } — answers the visitor by email from the
 * topic's role address and appends the reply to the stored thread.
 */
export async function handleInboxReply(request: Request, env: InboxEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, outcome: 'invalid', errors: ['body'] }, 413);
  }
  let raw: ArrayBuffer;
  try {
    raw = await request.arrayBuffer();
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['body'] }, 400);
  }
  if (raw.byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, outcome: 'invalid', errors: ['body'] }, 413);
  }
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['body'] }, 400);
  }

  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }
  if (!env.SUBMISSIONS || !env.BREVO_API_KEY || !env.MAIL_SEND_FROM) {
    return json({ ok: false, outcome: 'not-configured' }, 503);
  }

  const contentType = request.headers.get('content-type') ?? '';
  const origin = request.headers.get('origin') ?? '';
  if (!contentType.includes('application/json') || origin !== new URL(request.url).origin) {
    return json({ ok: false, outcome: 'invalid', errors: ['origin'] }, 403);
  }

  const id = str(body.id);
  const text = str(body.body);
  if (!id || id.includes('/') || id.includes('..') || !text || text.length > MAX_REPLY_CHARS) {
    return json({ ok: false, outcome: 'invalid', errors: !text ? ['body'] : ['id'] }, 400);
  }

  const key = await findSubmissionKey(env, id);
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const obj = await env.SUBMISSIONS.get(key);
  if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const item = (await obj.json()) as Submission;
  if (isAdminOnlySubmission(env, session.email, item)) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  }
  if (!item.email) {
    return json({ ok: false, outcome: 'invalid', errors: ['to'] }, 400);
  }

  const from = item.replyFrom?.toLowerCase() ?? TOPIC_FROM[item.topic] ?? 'welkom@sdatygerberg.co.za';
  if (!senders(env).has(from)) return json({ ok: false, outcome: 'not-configured' }, 503);
  if (!allowedFrom(env, session.email).includes(from)) {
    return json({ ok: false, outcome: 'not-allowed', errors: ['from'] }, 403);
  }

  const subject = item.topic === 'email'
    ? `Re: ${(item.subject ?? 'Email').replace(/^Re:\s*/i, '')}`
    : `Re: ${item.topic === 'bible-study' ? 'Bybelstudie-versoek' : 'Jou boodskap aan Tygerberg SDA'}`;
  const ok = await sendViaBrevo(
    env,
    from,
    [item.email],
    subject,
    text,
    mailHtml(text, from, LOGO_REMOTE_URL),
  );
  if (!ok) {
    console.log(`inbox: reply send-error to submission by=${session.email}`);
    return json({ ok: false, outcome: 'send-error' }, 502);
  }

  item.replies = [...(item.replies ?? []), { by: session.email, at: new Date().toISOString(), body: text }];
  await env.SUBMISSIONS.put(key, JSON.stringify(item));
  await storeSent(env, {
    by: session.email,
    from,
    to: [item.email],
    subject,
    body: text,
    kind: 'reply',
    threadId: item.id,
  });
  console.log(`inbox: reply sent by=${session.email}`);
  return json({ ok: true, outcome: 'sent' }, 200);
}
