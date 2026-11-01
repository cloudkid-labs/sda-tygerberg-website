/// <reference types="@cloudflare/workers-types" />

import { verifySession, isAdmin, isAdminOnlyEmail, allowedFrom, senders, type AuthEnv } from './auth';
import { sendViaBrevoWithId, storeSent, type MailSendEnv, type SentItem } from './mailSend';
import { isUnread, isWebsiteThread } from '../lib/mailUnread';
import { mailHtml, LOGO_REMOTE_URL } from './signature';

export type InboxEnv = AuthEnv &
  MailSendEnv & {
    SUBMISSIONS?: R2Bucket;
  };

/**
 * One message after the enquiry: the board's reply (`by` a board address,
 * `messageId` as Brevo sent it) or the visitor's emailed answer (`inbound`,
 * `by` their address, `messageId` from its header).
 */
export type SubmissionReply = { by: string; at: string; body?: string; messageId?: string; inbound?: boolean };
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
  /** First opened by anyone on the board — the inbox is shared, so is this. */
  readAt?: string;
  readBy?: string;
};

/** Visitor-facing enquiries always answer as the public role address. */
const TOPIC_FROM: Record<string, string> = {
  connect: 'welkom@sdatygerberg.co.za',
  'bible-study': 'welkom@sdatygerberg.co.za',
};

/** The subject every reply on a thread carries, so the visitor's mail app threads it. */
const TOPIC_SUBJECT: Record<string, string> = {
  connect: 'Jou boodskap aan Tygerberg SDA',
  'bible-study': 'Bybelstudie-versoek',
};

/**
 * The address a thread is answered from: its own, when that is one the
 * Worker can send as, else the topic's role address. A stored address that
 * is not a configured sender would otherwise block every reply, an
 * administrator's included.
 */
export function replyAddressFor(env: InboxEnv, item: Pick<Submission, 'replyFrom' | 'topic'>): string {
  const own = item.replyFrom?.trim().toLowerCase();
  if (own && senders(env).has(own)) return own;
  return TOPIC_FROM[item.topic] ?? 'welkom@sdatygerberg.co.za';
}

/**
 * Read, change, write back — only if nothing wrote the thread in between, so
 * a reply and the visitor's answer landing together both keep. Retries on a
 * race; null when the thread is gone or `change` declines (returns false).
 */
async function updateThread(
  bucket: R2Bucket,
  key: string,
  change: (item: Submission) => boolean,
  attempts = 3,
): Promise<Submission | null> {
  for (let i = 0; i < attempts; i++) {
    const obj = await bucket.get(key);
    if (!obj) return null;
    const item = (await obj.json()) as Submission;
    if (!change(item)) return null;
    if (await bucket.put(key, JSON.stringify(item), { onlyIf: { etagMatches: obj.etag } })) return item;
  }
  console.error(`inbox: thread write lost a race ${attempts} times key=${key}`);
  return null;
}

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
 * Each member sees only the mail of addresses they may send as
 * (BOARD_SEND_AS): a thread when they may answer it, from its reply address.
 * Admins see everything.
 */
function canSeeThread(env: InboxEnv, sessionEmail: string, item: Submission): boolean {
  if (isAdmin(env, sessionEmail)) return true;
  if (isAdminOnlySubmission(env, sessionEmail, item)) return false;
  return allowedFrom(env, sessionEmail).includes(replyAddressFor(env, item));
}

/** A Sent item when they may send as its From. Admins see everything. */
function canSeeSent(env: InboxEnv, sessionEmail: string, item: SentItem): boolean {
  if (isAdmin(env, sessionEmail)) return true;
  if (isAdminOnlySentItem(env, sessionEmail, item)) return false;
  return allowedFrom(env, sessionEmail).includes((item.from ?? '').trim().toLowerCase());
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
      // Board mail is the website's enquiries; other mail is delivered to the
      // church's mailboxes and never listed here.
      if (!isWebsiteThread(s)) continue;
      if (!canSeeThread(env, session.email, s)) continue;
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
  if (!isWebsiteThread(item) || !canSeeThread(env, session.email, item)) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  }
  if (isUnread(item)) {
    // Opening it is reading it — again after each emailed answer. Only if
    // nothing wrote the thread since this read (a reply landing now must never
    // be overwritten); a lost stamp leaves it unread, never fails the open.
    const stamped: Submission = { ...item, readAt: new Date().toISOString(), readBy: session.email };
    try {
      if (await env.SUBMISSIONS.put(key, JSON.stringify(stamped), { onlyIf: { etagMatches: obj.etag } })) {
        Object.assign(item, { readAt: stamped.readAt, readBy: stamped.readBy });
      }
    } catch {
      console.error(`inbox: read stamp FAILED key=${key}`);
    }
  }
  console.log(`inbox: read by=${session.email}`);
  return json({ ok: true, item: { ...item, replyAs: replyAddressFor(env, item) } }, 200);
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
    if (trashedOnly !== Boolean(item.trashedAt) || !canSeeSent(env, session.email, item)) {
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
      if (trashedOnly !== Boolean(s.trashedAt) || !canSeeSent(env, session.email, s)) continue;
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
  if (!isWebsiteThread(item) || !canSeeThread(env, session.email, item)) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  }
  if (!item.email) {
    return json({ ok: false, outcome: 'invalid', errors: ['to'] }, 400);
  }

  const from = replyAddressFor(env, item);
  if (!senders(env).has(from)) return json({ ok: false, outcome: 'not-configured' }, 503);
  if (!allowedFrom(env, session.email).includes(from)) {
    return json({ ok: false, outcome: 'not-allowed', errors: ['from'] }, 403);
  }

  const subject = `Re: ${TOPIC_SUBJECT[item.topic] ?? TOPIC_SUBJECT.connect}`;
  const { ok, messageId } = await sendViaBrevoWithId(
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

  const sentReply: SubmissionReply = { by: session.email, at: new Date().toISOString(), body: text, ...(messageId ? { messageId } : {}) };
  // The mail is out; the thread must show it even if an answer landed meanwhile.
  const kept = await updateThread(env.SUBMISSIONS, key, (t) => {
    t.replies = [...(t.replies ?? []), sentReply];
    return true;
  });
  if (!kept) console.error(`inbox: reply sent but not filed key=${key}`);
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

// ---- The visitor's emailed answers ------------------------------------------

export type InboundAnswer = {
  sender: string;
  subject: string;
  text: string;
  /** Its own Message-ID, and the ids it answers (In-Reply-To, References). */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
};

const MESSAGE_ID = /<[^<>\s]+>/g;
const ids = (...headers: (string | undefined)[]) =>
  new Set(headers.flatMap((h) => (h ?? '').match(MESSAGE_ID) ?? []).map((id) => id.toLowerCase()));
const bare = (id: string) => id.trim().toLowerCase().replace(/^<|>$/g, '');

/**
 * A reply quotes what it answers; keep only what the visitor wrote. Cut at
 * the first quote header or quoted line — and keep the whole text when that
 * would leave nothing.
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cut = lines.findIndex(
    (l, i) =>
      /^\s*>/.test(l) ||
      /^-{2,}\s*(original message|oorspronklike boodskap)\s*-{2,}/i.test(l.trim()) ||
      /^(on|op)\s.+(wrote|geskryf|het geskryf):\s*$/i.test(l.trim()) ||
      // "On … wrote:" folded over two lines by the sender's mail app.
      (/^(on|op)\s/i.test(l.trim()) && /(wrote|geskryf):\s*$/i.test(lines[i + 1]?.trim() ?? '')),
  );
  const kept = (cut < 0 ? lines : lines.slice(0, cut)).join('\n').trim();
  return kept || text.trim();
}

/**
 * Files an emailed answer under the website thread it answers, as an inbound
 * message; the thread turns unread and back under New. Matched by the
 * Message-ID of a reply we sent (In-Reply-To / References); failing that, by
 * the visitor's address on a thread we answered, under our reply subject.
 * Returns the thread id, or null when it answers none — such mail is only
 * delivered to the church's mailbox, never shown in Board mail.
 */
export async function fileInboundAnswer(bucket: R2Bucket, answer: InboundAnswer): Promise<string | null> {
  const sender = answer.sender.trim().toLowerCase();
  const answers = ids(answer.inReplyTo, answer.references);
  const subject = answer.subject.toLowerCase();
  const listed = await bucket.list({ prefix: 'submissions/', limit: 1000 });
  let byId: { key: string; id: string } | null = null;
  let bySender: { key: string; id: string; at: string } | null = null;
  for (const { key } of listed.objects) {
    const obj = await bucket.get(key);
    if (!obj) continue;
    let item: Submission;
    try {
      item = (await obj.json()) as Submission;
    } catch {
      continue;
    }
    if (!isWebsiteThread(item) || item.trashedAt) continue;
    const ours = (item.replies ?? []).filter((r) => !r.inbound);
    if (ours.some((r) => r.messageId && answers.has(`<${bare(r.messageId)}>`))) {
      byId = { key, id: item.id };
      break;
    }
    const base = (TOPIC_SUBJECT[item.topic] ?? '').toLowerCase();
    const last = ours[ours.length - 1];
    if (last && item.email?.toLowerCase() === sender && base && subject.includes(base) && (!bySender || last.at > bySender.at)) {
      bySender = { key, id: item.id, at: last.at };
    }
  }
  const hit = byId ?? bySender;
  if (!hit) return null;
  const messageId = answer.messageId ? `<${bare(answer.messageId)}>` : undefined;
  const entry: SubmissionReply = {
    by: sender,
    at: new Date().toISOString(),
    body: stripQuoted(answer.text),
    inbound: true,
    ...(messageId ? { messageId } : {}),
  };
  const kept = await updateThread(bucket, hit.key, (t) => {
    // The same mail delivered twice is filed once.
    if (messageId && (t.replies ?? []).some((r) => r.inbound && r.messageId === messageId)) return false;
    t.replies = [...(t.replies ?? []), entry];
    return true;
  });
  return kept ? hit.id : null;
}
