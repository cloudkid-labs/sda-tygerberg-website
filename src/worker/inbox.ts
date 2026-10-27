/// <reference types="@cloudflare/workers-types" />

import { verifySession, type AuthEnv } from './auth';
import { sendViaBrevo, type MailSendEnv } from './mailSend';

export type InboxEnv = AuthEnv &
  MailSendEnv & {
    SUBMISSIONS?: R2Bucket;
  };

export type SubmissionReply = { by: string; at: string };
export type Submission = {
  id: string;
  submittedAt: string;
  topic: string;
  name: string;
  email: string | null;
  phone: string | null;
  lang: string;
  message: string;
  replies: SubmissionReply[];
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
  const items: Omit<Submission, 'message'>[] = [];
  for (const key of keys) {
    const obj = await env.SUBMISSIONS.get(key);
    if (!obj) continue;
    try {
      const s = (await obj.json()) as Submission;
      const { message: _omitted, ...summary } = s;
      items.push(summary);
    } catch {
      // A stray object is skipped, never fatal — the log says which key.
      console.error(`inbox: unreadable object skipped key=${key}`);
    }
  }
  console.log(`inbox: list count=${items.length} by=${session.email}`);
  return json({ ok: true, items }, 200);
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

  const id = str(new URL(request.url).searchParams.get('id'));
  if (!id || id.includes('/') || id.includes('..')) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 400);
  }
  const listed = await env.SUBMISSIONS.list({ prefix: 'submissions/', limit: 1000 });
  const key = listed.objects.map((o) => o.key).find((k) => k.endsWith(`-${id}.json`));
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const obj = await env.SUBMISSIONS.get(key);
  if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  console.log(`inbox: read by=${session.email}`);
  return json({ ok: true, item: (await obj.json()) as Submission }, 200);
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

  const listed = await env.SUBMISSIONS.list({ prefix: 'submissions/', limit: 1000 });
  const key = listed.objects.map((o) => o.key).find((k) => k.endsWith(`-${id}.json`));
  if (!key) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const obj = await env.SUBMISSIONS.get(key);
  if (!obj) return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 404);
  const item = (await obj.json()) as Submission;
  if (!item.email) {
    return json({ ok: false, outcome: 'invalid', errors: ['to'] }, 400);
  }

  const from = TOPIC_FROM[item.topic] ?? 'welkom@sdatygerberg.co.za';
  const senders = new Set(
    (env.MAIL_SEND_FROM ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  if (!senders.has(from)) return json({ ok: false, outcome: 'not-configured' }, 503);

  const ok = await sendViaBrevo(
    env,
    from,
    [item.email],
    `Re: ${item.topic === 'bible-study' ? 'Bybelstudie-versoek' : 'Jou boodskap aan Tygerberg SDA'}`,
    text,
  );
  if (!ok) {
    console.log(`inbox: reply send-error to submission by=${session.email}`);
    return json({ ok: false, outcome: 'send-error' }, 502);
  }

  item.replies = [...(item.replies ?? []), { by: session.email, at: new Date().toISOString() }];
  await env.SUBMISSIONS.put(key, JSON.stringify(item));
  console.log(`inbox: reply sent by=${session.email}`);
  return json({ ok: true, outcome: 'sent' }, 200);
}
