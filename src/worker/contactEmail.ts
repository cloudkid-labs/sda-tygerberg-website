/// <reference types="@cloudflare/workers-types" />

import type { ContactTopic } from './contact';

export type ContactEmailEnv = {
  /**
   * The `send_email` binding declared in wrangler.jsonc. Absent when the
   * deploy carries no `send_email` binding, so the code treats a missing
   * binding as "email not configured" rather than crashing.
   */
  EMAIL?: SendEmail;
  /**
   * Where enquiries land. A **verified destination address** on the Cloudflare
   * account — sends to those are free on every plan and skip the sending quota
   * entirely (C-31).
   *
   * Currently a committed var rather than a Worker secret, which is a temporary
   * decision recorded in docs/adr/0001-hardcode-contact-addresses.md. This code
   * does not care which it is; do not add anything here that assumes either.
   */
  CONTACT_EMAIL_TO?: string;
  /**
   * The From address, DKIM-aligned by the domain's `cf-bounce` records and
   * listed in the binding's `allowed_sender_addresses`.
   */
  CONTACT_EMAIL_FROM?: string;
  /**
   * Optional blind copy — a church-controlled archive inbox. Unset means no BCC.
   *
   * Must *also* be a verified destination address and listed in the
   * `send_email` fence: the free path verifies every recipient, so an unverified
   * BCC fails the whole send rather than quietly dropping the copy (C-31).
   */
  CONTACT_EMAIL_BCC?: string;
};

/**
 * Church-facing labels, in Afrikaans like the rest of what the church reads.
 *
 * Deliberately not in `src/data/` with the site copy: that module is part of
 * the client i18n bundle, and importing it here would pull React-side copy into
 * the Worker for the sake of two words. This text is never rendered on the site.
 */
const TOPIC_LABELS: Record<ContactTopic, string> = {
  connect: 'Verbind',
  'bible-study': 'Bybelstudie',
};

/**
 * Strips anything that could break out of a header line, then clamps.
 *
 * `name` is only length-checked on the way in, so it can still hold a CR or LF
 * and a raw one in the subject is header injection. The platform encodes
 * headers itself; this is the belt to that braces — CONCERNS.md C-32.
 */
function headerSafe(value: string, max: number): string {
  const flattened = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flattened.length > max ? `${flattened.slice(0, max - 1)}…` : flattened;
}

/** The enquiry as the church archive keeps it. Plain text — no styling to get wrong. */
function body(fields: Record<string, string>, submittedAt: string, recordId?: string): string {
  const lines = [
    'Nuwe navraag vanaf die webwerf.',
    '',
    `Onderwerp: ${TOPIC_LABELS[fields.topic as ContactTopic] ?? fields.topic}`,
    `Naam: ${fields.name}`,
    `E-pos: ${fields.email || '(nie verskaf nie)'}`,
    `Telefoon: ${fields.phone || '(nie verskaf nie)'}`,
    '',
    'Boodskap:',
    fields.message || '(geen boodskap nie)',
    '',
    '—',
    // POPIA consent has to be demonstrable after the fact, and this inbox is
    // the only place the submission survives — C-20.
    'Toestemming gegee: ja',
    `Ontvang: ${submittedAt}`,
    // Ties this mail to the object in the consent bucket. Omitted rather than
    // printed empty when the bucket is unbound, so the line never implies a
    // stored record that does not exist.
    ...(recordId ? [`Toestemmingsrekord: ${recordId}`] : []),
  ];
  return lines.join('\n');
}

/**
 * The Gmail receivers never get the enquiry itself — only this notification
 * naming who wrote, about what, and when, with the login link. The message
 * lives in the /kerkraad inbox (R2) and the archive copy below; reading it
 * means signing in. No contact details either: with the address in hand a
 * reply could bypass the inbox entirely, which is what this withholds.
 */
function notificationBody(fields: Record<string, string>, submittedAt: string): string {
  return [
    'Nuwe boodskap op die webwerf.',
    '',
    `Onderwerp: ${TOPIC_LABELS[fields.topic as ContactTopic] ?? fields.topic}`,
    `Naam: ${headerSafe(fields.name, 80)}`,
    `Ontvang: ${submittedAt}`,
    '',
    'Meld aan by https://sdatygerberg.co.za/login om dit te lees.',
  ].join('\n');
}

/**
 * Emails one validated submission to the church.
 *
 * Two sends, two audiences: the notification tells the Gmail receivers there
 * is mail waiting behind the login; the archive copy carries the full enquiry
 * to the church-controlled address that files into R2. Either may fail
 * without failing the other — the archive is best-effort (its R2 bucket has
 * the SUBMISSIONS copy anyway), but a failed notification fails the channel
 * because nobody was told.
 *
 * Returns false rather than throwing: the caller decides what a failed channel
 * means, and a contact form should never surface a platform error to a visitor.
 */
export async function sendContactEmail(
  env: ContactEmailEnv,
  fields: Record<string, string>,
  submittedAt: string,
  recordId?: string,
): Promise<boolean> {
  const { EMAIL, CONTACT_EMAIL_TO, CONTACT_EMAIL_FROM, CONTACT_EMAIL_BCC } = env;
  if (!EMAIL || !CONTACT_EMAIL_TO || !CONTACT_EMAIL_FROM) return false;

  const startedAt = Date.now();
  const label = TOPIC_LABELS[fields.topic as ContactTopic] ?? 'Navraag';

  console.log(
    `contact send: start to=${CONTACT_EMAIL_TO} from=${CONTACT_EMAIL_FROM}` +
      ` archive=${CONTACT_EMAIL_BCC ?? 'unset'} topic=${fields.topic}` +
      ` record=${recordId ?? 'absent'}`,
  );
  try {
    await EMAIL.send({
      to: CONTACT_EMAIL_TO,
      from: CONTACT_EMAIL_FROM,
      subject: `Nuwe boodskap — ${label}: ${headerSafe(fields.name, 60)} — meld aan om te lees`,
      text: notificationBody(fields, submittedAt),
    });
    console.log(`contact send: notified in ${Date.now() - startedAt}ms to=${CONTACT_EMAIL_TO}`);
  } catch (error) {
    // Logged for the observability tail. The code and message only — the
    // submission itself is personal data and does not belong in logs (C-20).
    const code = (error as { code?: string })?.code ?? 'unknown';
    const message = (error as { message?: string })?.message ?? '';
    console.error(
      `contact send: FAILED in ${Date.now() - startedAt}ms code=${code} detail=${message}`,
    );
    return false;
  }

  // The record copy: full enquiry to each church-controlled archive address,
  // which files into R2. One send per address — `to` takes a single address
  // on the Workers send binding. Best-effort: the inbox copy in SUBMISSIONS
  // already holds the message, so a failed archive hop is logged, never fatal.
  for (const addr of (CONTACT_EMAIL_BCC ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      await EMAIL.send({
        to: addr,
        from: CONTACT_EMAIL_FROM,
        subject: `Webwerf — ${label}: ${headerSafe(fields.name, 60)}`,
        ...(fields.email ? { replyTo: fields.email } : {}),
        text: body(fields, submittedAt, recordId),
      });
      console.log(`contact send: archived to=${addr}`);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? 'unknown';
      console.error(`contact send: archive FAILED to=${addr} code=${code}`);
    }
  }
  return true;
}
