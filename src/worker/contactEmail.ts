/// <reference types="@cloudflare/workers-types" />

import type { ContactTopic } from './contact';

export type ContactEmailEnv = {
  /**
   * The `send_email` binding declared in wrangler.jsonc. Absent when the
   * account has no Email Service onboarding yet, so the code treats a missing
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
   * The From address, on a domain onboarded to Cloudflare Email Service, and
   * within the binding's `allowed_sender_addresses`.
   */
  CONTACT_EMAIL_FROM?: string;
  /**
   * Optional blind copy — an archive or monitoring inbox. Unset means no BCC.
   *
   * Must *also* be a verified destination address: the free path verifies every
   * recipient, so an unverified BCC fails the whole send rather than quietly
   * dropping the copy (C-31).
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

/** The enquiry as the church reads it. Plain text — no styling to get wrong. */
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
 * Emails one validated submission to the church.
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
      ` bcc=${CONTACT_EMAIL_BCC ?? 'unset'} topic=${fields.topic}` +
      ` replyTo=${fields.email ? 'set' : 'unset'}` +
      ` record=${recordId ?? 'absent'}`,
  );
  try {
    await EMAIL.send({
      to: CONTACT_EMAIL_TO,
      from: CONTACT_EMAIL_FROM,
      // Omitted entirely when unset — an empty string would be a malformed
      // recipient rather than "no recipient".
      // BCC accepts an array (Workers send binding, doc: EmailMessageBuilder).
      // Split on commas so the var stays one readable line in wrangler.jsonc.
      ...(CONTACT_EMAIL_BCC
        ? { bcc: CONTACT_EMAIL_BCC.split(',').map((s) => s.trim()).filter(Boolean) }
        : {}),
      subject: `Webwerf — ${label}: ${headerSafe(fields.name, 60)}`,
      // Set only when the visitor gave an address, so replying either reaches
      // them or is visibly impossible — never silently mailing the From alias.
      // Safe as a header: the validating regex forbids whitespace, so no CR/LF
      // can survive into it.
      ...(fields.email ? { replyTo: fields.email } : {}),
      text: body(fields, submittedAt, recordId),
    });
    console.log(
      `contact send: ok in ${Date.now() - startedAt}ms to=${CONTACT_EMAIL_TO}` +
        ` bccCount=${(CONTACT_EMAIL_BCC ?? '').split(',').filter(Boolean).length}`,
    );
    return true;
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
}
