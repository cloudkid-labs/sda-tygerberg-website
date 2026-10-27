/// <reference types="@cloudflare/workers-types" />

import { verifySession, allowedFrom, senders, type AuthEnv } from './auth';
import { mailHtml, loadLogoBytes, LOGO_CID, LOGO_NAME, LOGO_REMOTE_URL } from './signature';

export type MailSendEnv = AuthEnv & {
  /** Brevo v3 API key. Absent answers `not-configured`, like every secret here. */
  BREVO_API_KEY?: string;
  /**
   * Role addresses the board may send as, comma-separated — the same shape as
   * CONTACT_EMAIL_BCC. Public role addresses, so a var, not a secret (ADR-0001).
   */
  MAIL_SEND_FROM?: string;
  /** The /kerkraad bucket. Unset skips the Sent copy, never the send. */
  SUBMISSIONS?: R2Bucket;
};

/** One outbound mail for the Sent box: a compose send or a thread reply. */
export type SentItem = {
  id: string;
  at: string;
  by: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  kind: 'compose' | 'reply';
  threadId: string | null;
};

/**
 * Files one outbound mail under `sent/`. Best-effort like every other R2
 * write here: a failed put is logged, never fatal — the mail already went.
 */
export async function storeSent(
  env: MailSendEnv,
  item: Omit<SentItem, 'id' | 'at'>,
): Promise<void> {
  if (!env.SUBMISSIONS) return;
  const at = new Date().toISOString();
  const [date] = at.split('T');
  const rand = [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const id = `${Date.now().toString(36)}${rand}`;
  try {
    await env.SUBMISSIONS.put(
      `sent/${date.replaceAll('-', '/')}/${at}-${id}.json`,
      JSON.stringify({ ...item, id, at }),
    );
  } catch {
    console.error('mailsend: sent store FAILED');
  }
}

const ARCHIVE_BCC = 'archive@sdatygerberg.co.za';
// shortcut: single literal instead of a third env name; if the archive ever
// moves, promote this to MAIL_SEND_BCC and pin it in the routing doc + test.
// (archive@ files into R2 under the 7-year retention, C-65.)

export type MailSendOutcome = 'sent' | 'invalid' | 'unauthorised' | 'not-allowed' | 'not-configured' | 'send-error';

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

function isConfigured(env: MailSendEnv): boolean {
  return Boolean(env.BREVO_API_KEY && env.MAIL_SEND_FROM && env.SESSION_SECRET);
}

export type BrevoAttachment = { content: string; name: string };

export async function sendViaBrevo(
  env: MailSendEnv,
  from: string,
  to: string[],
  subject: string,
  text: string,
  html: string,
  attachment: BrevoAttachment | null = null,
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
        htmlContent: html,
        ...(attachment ? { attachment: [attachment] } : {}),
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

  // Per-sender send-as fence: the treasurer writes only as tesourier@.
  // Unknown addresses fail the allow-list above; this is the finer fence.
  if (!allowedFrom(env, session.email).includes(from)) {
    return json({ ok: false, outcome: 'not-allowed', errors: ['from'] }, 403);
  }

  const cleanSubject = headerSafe(subject, MAX_SUBJECT);
  const cleanTo = [...new Set(to.map((a) => a.toLowerCase()))];
  // The body goes out exactly as written — no attribution footer. Who sent
  // what stays in the Worker logs and the R2 archive, never in the message.
  // The HTML alternative carries the church signature (signature.ts).
  // The logo rides along as a CID attachment (remote images get stripped by
  // several inboxes); without it the signature falls back to the remote URL.
  const logo = await loadLogoBytes(new URL(request.url).origin);
  const logoSrc = logo ? `cid:${LOGO_CID}` : LOGO_REMOTE_URL;
  const logoAttachment = logo ? { content: logo, name: LOGO_NAME } : null;
  if (!(await sendViaBrevo(env, from, cleanTo, cleanSubject, text, mailHtml(text, from, logoSrc), logoAttachment))) {
    console.log(`mailsend: outcome=send-error from=${from} by=${session.email}`);
    return json({ ok: false, outcome: 'send-error' }, 502);
  }
  // The Sent-box record. Best-effort: the mail went, so a failed put only logs.
  await storeSent(env, {
    by: session.email,
    from,
    to: cleanTo,
    subject: cleanSubject,
    body: text,
    kind: 'compose',
    threadId: null,
  });
  console.log(`mailsend: outcome=sent from=${from} by=${session.email}`);
  return json({ ok: true, outcome: 'sent' }, 200);
}
