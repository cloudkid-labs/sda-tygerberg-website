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
 * What the Gmail receivers get: the full enquiry plus the login link, so the
 * message is readable right in the inbox while the /kerkraad thread stays the
 * working copy. Closes by pointing at the attached login screenshots, then
 * the church signature in plain text.
 */
function notificationBody(fields: Record<string, string>, submittedAt: string, recordId?: string): string {
  return [
    body(fields, submittedAt, recordId),
    '',
    'Teken in by https://sdatygerberg.co.za/login om dit in die inkassie te lees.',
    'Die aangehegte media wys hoe om aan te meld.',
    '',
    '—',
    'Tygerberg SDA Kerk',
    'welkom@sdatygerberg.co.za',
    '54 Boston St, Boston, Kaapstad, 7530 · sdatygerberg.co.za',
  ].join('\n');
}

/**
 * Login screenshots attached to the notification so the receiver sees how
 * to sign in. Public static assets, fetched from the site's own origin at
 * send time — best-effort: a failed load sends the notification without them
 * rather than failing the channel. The loader is a parameter so tests can
 * stub the bytes instead of hitting the network. Typed as EmailAttachment so
 * the compiler guards the shape the send_email binding actually reads —
 * `attachments` with filename/type, not a stray `attachment` key.
 */
const ATTACHMENT_PATHS = [
  '/images/login/meld-aan-desktop.png',
  '/images/login/meld-aan-mobile-1.png',
  '/images/login/meld-aan-mobile-2.png',
];

async function loadAttachments(
  origin: string,
  load: typeof fetch = fetch,
): Promise<EmailAttachment[]> {
  const out: EmailAttachment[] = [];
  for (const path of ATTACHMENT_PATHS) {
    try {
      const res = await load(`${origin}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 5 * 1024 * 1024) throw new Error('size');
      let s = '';
      for (const b of buf) s += String.fromCharCode(b);
      const filename = path.split('/').pop();
      if (filename) out.push({ disposition: 'attachment', filename, type: 'image/png', content: btoa(s) });
    } catch {
      console.error(`contact send: attachment skipped path=${path}`);
    }
  }
  return out;
}

/**
 * Emails one validated submission to the church: the full enquiry plus the
 * login link to the Gmail receivers, with the login screenshots attached;
 * the same full enquiry to the church-controlled archive address for the R2
 * record. Either may fail without failing the other — the archive is
 * best-effort, but a failed notification fails the channel because nobody
 * was told.
 *
 * Returns false rather than throwing: the caller decides what a failed channel
 * means, and a contact form should never surface a platform error to a visitor.
 */
export async function sendContactEmail(
  env: ContactEmailEnv,
  fields: Record<string, string>,
  submittedAt: string,
  recordId?: string,
  origin?: string,
  load: typeof fetch = fetch,
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
    const attachments = origin ? await loadAttachments(origin, load) : [];
    await EMAIL.send({
      to: CONTACT_EMAIL_TO,
      from: CONTACT_EMAIL_FROM,
      subject: `Nuwe boodskap — ${label}: ${headerSafe(fields.name, 60)} — meld aan om te lees`,
      text: notificationBody(fields, submittedAt, recordId),
      ...(attachments.length > 0 ? { attachments } : {}),
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
