/// <reference types="@cloudflare/workers-types" />

import { verifySession, type AuthEnv } from './auth';

export type MailSendEnv = AuthEnv & {
  /** Brevo v3 API key. Absent answers `not-configured`, like every secret here. */
  BREVO_API_KEY?: string;
  /**
   * Role addresses the board may send as, comma-separated — the same shape as
   * CONTACT_EMAIL_BCC. Public role addresses, so a var, not a secret (ADR-0001).
   */
  MAIL_SEND_FROM?: string;
};

const ARCHIVE_BCC = 'archive@sdatygerberg.co.za';
// shortcut: single literal instead of a third env name; if the archive ever
// moves, promote this to MAIL_SEND_BCC and pin it in the routing doc + test.
// (archive@ files into R2 under the 7-year retention, C-65.)

export type MailSendOutcome = 'sent' | 'invalid' | 'unauthorised' | 'not-configured' | 'send-error';

/** Deliberately loose, same as contact.ts — replying proves deliverability. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RECIPIENTS = 5;
const MAX_SUBJECT = 150;
const MAX_BODY_CHARS = 10_000;
const BREVO_TIMEOUT_MS = 10_000;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function json(result: { ok: boolean; outcome: MailSendOutcome; errors?: string[] }, status: number): Response {
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Strips anything that could break out of a header line, then clamps.
 * Same belt-to-braces as contactEmail.ts headerSafe (C-32): C0 controls and
 * DEL become spaces. Written as a loop so the source stays plain ASCII.
 */
function headerSafe(value: string, max: number): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  const flattened = out.replace(/\s+/g, ' ').trim();
  return flattened.length > max ? `${flattened.slice(0, max - 1)}…` : flattened;
}

function senders(env: MailSendEnv): Set<string> {
  return new Set(
    (env.MAIL_SEND_FROM ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isConfigured(env: MailSendEnv): boolean {
  return Boolean(env.BREVO_API_KEY && env.MAIL_SEND_FROM && env.SESSION_SECRET);
}

export async function sendViaBrevo(
  env: MailSendEnv,
  from: string,
  to: string[],
  subject: string,
  text: string,
): Promise<boolean> {
  const startedAt = Date.now();
  console.log(`mailsend: start from=${from} toCount=${to.length}`);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: from },
        to: to.map((email) => ({ email })),
        // Replies return through Email Routing to the church inbox.
        replyTo: { email: from },
        bcc: [{ email: ARCHIVE_BCC }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`mailsend: FAILED status=${res.status} from=${from}`);
      return false;
    }
    console.log(`mailsend: ok in ${Date.now() - startedAt}ms from=${from}`);
    return true;
  } catch {
    console.error(`mailsend: FAILED timeout-or-net from=${from}`);
    return false;
  }
}

/**
 * POST /api/mail/send for the /kerkraad page. Body:
 * `{ from, to[], subject, body }`. Guard order mirrors handleContact —
 * transport, configured, session, then validation.
 */
export async function handleMailSend(request: Request, env: MailSendEnv): Promise<Response> {
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

  if (!isConfigured(env)) {
    return json({ ok: false, outcome: 'not-configured' }, 503);
  }
  const session = await verifySession(request, env);
  if (!session.ok) {
    return json(
      { ok: false, outcome: session.outcome },
      session.outcome === 'not-configured' ? 503 : 401,
    );
  }

  // SameSite=Lax plus a JSON content type (forces a preflight) plus an Origin
  // check equal to the site origin — a form on another origin cannot ride the
  // session cookie.
  const contentType = request.headers.get('content-type') ?? '';
  const origin = request.headers.get('origin') ?? '';
  if (!contentType.includes('application/json') || origin !== new URL(request.url).origin) {
    return json({ ok: false, outcome: 'invalid', errors: ['origin'] }, 403);
  }

  const errors: string[] = [];
  const from = str(body.from).toLowerCase();
  if (!senders(env).has(from)) errors.push('from');

  const rawTo = Array.isArray(body.to) ? body.to : [];
  const to = rawTo.map(str).filter(Boolean);
  if (
    to.length < 1 ||
    to.length > MAX_RECIPIENTS ||
    to.some((a) => a.length > 254 || !EMAIL_RE.test(a))
  ) {
    errors.push('to');
  }

  const subject = str(body.subject);
  if (!subject || subject.length > MAX_SUBJECT) errors.push('subject');
  const text = str(body.body);
  if (!text || text.length > MAX_BODY_CHARS) errors.push('body');
  if (errors.length > 0) return json({ ok: false, outcome: 'invalid', errors }, 400);

  const cleanSubject = headerSafe(subject, MAX_SUBJECT);
  const cleanTo = [...new Set(to.map((a) => a.toLowerCase()))];
  // The body goes out exactly as written — no attribution footer. Who sent
  // what stays in the Worker logs and the R2 archive, never in the message.
  const textContent = text;

  if (!(await sendViaBrevo(env, from, cleanTo, cleanSubject, textContent))) {
    console.log(`mailsend: outcome=send-error from=${from} by=${session.email}`);
    return json({ ok: false, outcome: 'send-error' }, 502);
  }
  console.log(`mailsend: outcome=sent from=${from} by=${session.email}`);
  return json({ ok: true, outcome: 'sent' }, 200);
}
