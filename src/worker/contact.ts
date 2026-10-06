/// <reference types="@cloudflare/workers-types" />

import type { Lang } from '../data/site';
import { sendContactEmail, type ContactEmailEnv } from './contactEmail';
import { buildConsentRecord, storeConsent, type ConsentEnv } from './consentRecord';
import { checkTurnstile, type TurnstileEnv } from './turnstile';

export type ContactEnv = ContactEmailEnv &
  ConsentEnv &
  TurnstileEnv & {
    // Any endpoint accepting a JSON POST. A Worker secret, not a build-time var:
    // it is a delivery address, and a public one invites spam. Unset answers
    // `not-configured` and the form says so.
    //
    // The fallback channel now: email is tried first when it is configured — see
    // `deliver()` below and C-31.
    CONTACT_WEBHOOK_URL?: string;
  };

/** Which page the request came from — decides who the church routes it to. */
export type ContactTopic = 'connect' | 'bible-study';

export type ContactOutcome = 'forwarded' | 'not-configured' | 'invalid' | 'forward-error';

/** Which channel actually carried it. Diagnostic only — the form ignores it. */
export type ContactVia = 'email' | 'webhook';

export type ContactResult = {
  ok: boolean;
  outcome: ContactOutcome;
  /** Field names that failed validation, so the form can mark them inline. */
  errors?: string[];
  /** Present only on `forwarded`. */
  via?: ContactVia;
  /**
   * Whether the consent record reached R2. Diagnostic only — a false here never
   * fails a submission, because the enquiry email carries the consent line
   * regardless. Absent when the bucket is not bound at all.
   */
  consentStored?: boolean;
};

const TOPICS: ContactTopic[] = ['connect', 'bible-study'];

// Room for a real message; not room for a bot to post a megabyte.
const LIMITS = {
  name: 80,
  email: 254,
  phone: 40,
  message: 2000,
} as const;

/** Deliberately loose. Real deliverability is proven by replying, not by a regex. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_BODY_BYTES = 16 * 1024;
const FORWARD_TIMEOUT_MS = 10_000;

type RawBody = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function json(result: ContactResult, status: number): Response {
  return Response.json(result, {
    status,
    // A submission result is per-request and never cacheable.
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Validates a submission, returning the cleaned payload or the failed fields.
 * Missing consent is as fatal as a missing name — CONCERNS.md C-20.
 */
function validate(body: RawBody): { errors: string[]; clean?: Record<string, string>; lang: Lang } {
  const errors: string[] = [];

  // Which wording the visitor was shown, for the consent record. Metadata, not
  // a field: anything unrecognised falls back to the site's default language
  // rather than rejecting an otherwise good enquiry over a language tag.
  const lang: Lang = body.lang === 'en' ? 'en' : 'af';

  const topic = str(body.topic);
  if (!TOPICS.includes(topic as ContactTopic)) errors.push('topic');

  const name = str(body.name);
  if (!name || name.length > LIMITS.name) errors.push('name');

  const email = str(body.email);
  if (email && (email.length > LIMITS.email || !EMAIL_RE.test(email))) errors.push('email');

  const phone = str(body.phone);
  if (phone.length > LIMITS.phone) errors.push('phone');

  // Either channel is fine; requiring both collects more than is needed (C-20).
  if (!email && !phone) errors.push('contact');

  const message = str(body.message);
  if (message.length > LIMITS.message) errors.push('message');

  if (body.consent !== true) errors.push('consent');

  if (errors.length > 0) return { errors, lang };

  return { errors, clean: { topic, name, email, phone, message }, lang };
}

async function forward(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    // Timeout, DNS, TLS. Becomes `forward-error` — C-19.
    return false;
  }
}

/**
 * Delivers one submission, preferring email. Returns the channel that carried
 * it, or `null` if every configured channel failed.
 *
 * Email first because it needs no third-party service and lands in an inbox a
 * person already reads; the webhook stays as the fallback so a deploy without
 * the `send_email` binding still works. Both configured means the webhook is
 * only reached when email fails — deliberately not both at once, which would
 * double every enquiry. CONCERNS.md C-31.
 */
async function deliver(
  env: ContactEnv,
  clean: Record<string, string>,
  lang: Lang,
): Promise<{ via: ContactVia | null; consentStored?: boolean }> {
  const submittedAt = new Date().toISOString();

  // Built and stored *before* delivery, deliberately. Consent was given at
  // submission; if the church's mail then bounces, the record of that consent
  // must still exist. Doing it the other way round would lose exactly the
  // evidence POPIA asks for in exactly the case you would want it — C-34.
  const record = buildConsentRecord(clean, submittedAt, lang);
  const consentStored = env.CONSENT ? await storeConsent(env, record) : undefined;

  // The id goes into the enquiry too, so the mail a person reads and the object
  // in the bucket can be tied together without guessing from timestamps.
  //
  // Only where the object exists, though. Quoting an id is a claim that it can
  // be looked up, and an unbound binding or a failed put would make that claim
  // false — sending an auditor after something never written, which is worse
  // than saying nothing. Both downstreams take it from `storedId` for that
  // reason; `contactEmail.ts` already omits the line when it is absent.
  const storedId = consentStored ? record.id : undefined;

  if (await sendContactEmail(env, clean, submittedAt, storedId)) {
    return { via: 'email', consentStored };
  }
  // Not a silent fallback: the send error itself was already logged inside
  // sendContactEmail (code + message, no field values). This line records
  // that the *email* channel failed and delivery is trying the webhook — the
  // gap worth one grep when neither channel arrives.
  console.error('contact: email channel failed, trying webhook fallback');

  if (env.CONTACT_WEBHOOK_URL) {
    const sent = await forward(env.CONTACT_WEBHOOK_URL, {
      ...clean,
      submittedAt,
      // Recorded here as well as in R2: the webhook receiver is a separate
      // system and cannot read the bucket. `consent` is the fact — true because
      // the form enforced it — and stands whether or not the put succeeded; the
      // id is a pointer, so it is omitted entirely when there is nothing to
      // point at.
      consent: true,
      ...(storedId ? { consentRecordId: storedId } : {}),
      source: 'tygerberg-sda-website',
    });
    if (sent) return { via: 'webhook', consentStored };
  }

  return { via: null, consentStored };
}

/** Is any delivery channel set up at all? Decides `not-configured` vs a failure. */
function isConfigured(env: ContactEnv): boolean {
  const email = Boolean(env.EMAIL && env.CONTACT_EMAIL_TO && env.CONTACT_EMAIL_FROM);
  return email || Boolean(env.CONTACT_WEBHOOK_URL);
}

/**
 * POST /api/contact for the /connect and /bible-studies forms. Only reports
 * `forwarded` once a channel has actually accepted it — CONCERNS.md C-19.
 */
export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  }

  // Content-Length is a claim, not a fact — a chunked request omits it and junk
  // parses to NaN, both slipping past a `>` test. Cheap early-out only; the
  // measured size decides.
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

  let body: RawBody;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as RawBody;
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['body'] }, 400);
  }

  // Bot filtering is Turnstile's where a secret is set, skipped where none is
  // (local dev, devtest) — CONCERNS.md C-21.
  const { errors, clean, lang } = validate(body);
  if (!clean) return json({ ok: false, outcome: 'invalid', errors }, 400);

  // Before delivery and before the configured check: an unconfigured deploy
  // answers `not-configured`, never a captcha error, so previews keep saying
  // what they mean.
  if ((await checkTurnstile(request, body, env)) === false) {
    return json({ ok: false, outcome: 'invalid', errors: ['captcha'] }, 400);
  }

  if (!isConfigured(env)) {
    return json({ ok: false, outcome: 'not-configured' }, 503);
  }

  const { via, consentStored } = await deliver(env, clean, lang);

  // Structured log lines — addresses and outcomes only, never field values
  // (the submission is personal data; C-20). Three lines per enquiry, each
  // greppable by its prefix:
  //   `contact: `        the channel decision + consent state
  //   `contact send: …`  the email hop's own begin/end/failure (contactEmail.ts)
  // The tail is this channel's entire diagnostic surface.
  console.log(
    `contact: outcome=${via ? 'forwarded' : 'forward-error'} via=${via ?? 'none'}` +
      ` consentStored=${consentStored ?? 'unbound'}` +
      ` consentBinding=${env.CONSENT ? 'bound' : 'unbound'}` +
      ` emailBinding=${env.EMAIL ? 'bound' : 'unbound'}` +
      ` webhookBinding=${env.CONTACT_WEBHOOK_URL ? 'bound' : 'unbound'}` +
      ` turnstile=${env.TURNSTILE_SECRET_KEY ? 'enforced' : 'absent'}`,
  );

  return via
    ? json({ ok: true, outcome: 'forwarded', via, consentStored }, 200)
    : json({ ok: false, outcome: 'forward-error', consentStored }, 502);
}
