/// <reference types="@cloudflare/workers-types" />

import type { Lang } from '../data/site';
import type { ContactTopic } from './contact';

export type ConsentEnv = {
  /**
   * The `consent-cloudkid-link` R2 bucket. Optional on purpose: an unbound
   * Worker records consent in the enquiry email alone, exactly as it did before
   * this module existed, rather than failing a submission over storage.
   */
  CONSENT?: R2Bucket;
};

/**
 * The wording the visitor actually agreed to, pinned here rather than imported
 * from `src/data/requestCopy.ts`.
 *
 * Two reasons, and neither is style. That module is part of the client i18n
 * bundle and importing it would pull React-side copy into the Worker — the same
 * call `contactEmail.ts` makes. More importantly, a consent record has to state
 * what was agreed to *at the time*: pointing at live copy would silently rewrite
 * every historical record the next time someone edits the form. Change the
 * label on the form and you add a version here; you do not edit the old one.
 *
 * Keep in step with `consentLabel` in `src/data/requestCopy.ts`.
 */
const CONSENT_TEXT: Record<Lang, string> = {
  af: 'Ek gee toestemming dat die kerk my besonderhede mag gebruik om my oor hierdie versoek te kontak.',
  en: 'I consent to the church using my details to contact me about this request.',
};

/** Bump when `CONSENT_TEXT` changes. Old records keep the version they carry. */
export const CONSENT_VERSION = '2026-08-08';

/**
 * What is kept, and deliberately what is not.
 *
 * POPIA asks that consent be demonstrable: who agreed, when, to what wording,
 * and how to reach them. The enquiry's free-text `message` is not part of that
 * and is the most sensitive thing a visitor types, so it stays out — the email
 * already carries it to a human. C-20's "minimum needed" applies to storage at
 * rest more strongly than it does to an inbox.
 */
export type ConsentRecord = {
  id: string;
  submittedAt: string;
  topic: ContactTopic;
  name: string;
  /** Whichever the visitor gave; the form requires one of the two — C-20. */
  email: string | null;
  phone: string | null;
  consent: true;
  consentVersion: string;
  consentLang: Lang;
  /** The exact sentence shown, so the record stands on its own. */
  consentText: string;
  source: 'sda-struisbaai-website';
};

export function buildConsentRecord(
  fields: Record<string, string>,
  submittedAt: string,
  lang: Lang,
): ConsentRecord {
  return {
    id: crypto.randomUUID(),
    submittedAt,
    topic: fields.topic as ContactTopic,
    name: fields.name,
    email: fields.email || null,
    phone: fields.phone || null,
    consent: true,
    consentVersion: CONSENT_VERSION,
    consentLang: lang,
    consentText: CONSENT_TEXT[lang],
    source: 'sda-struisbaai-website',
  };
}

/**
 * Date-prefixed so the bucket browses as a calendar and a retention sweep can
 * work on a prefix. The id is on the end because two submissions can share a
 * second.
 */
export function consentKey(record: ConsentRecord): string {
  const [date] = record.submittedAt.split('T');
  return `${date.replaceAll('-', '/')}/${record.submittedAt}-${record.id}.json`;
}

/**
 * Stores one consent record. Returns whether it landed.
 *
 * **Never throws, and never blocks the enquiry.** A visitor who filled in the
 * form is owed delivery to the church; a storage fault is our problem, not
 * theirs, and the email still carries the consent line either way. The caller
 * reports the failure in the response for diagnostics only — C-19 is about
 * *delivery*, and this is not delivery.
 */
export async function storeConsent(
  env: ConsentEnv,
  record: ConsentRecord,
): Promise<boolean> {
  if (!env.CONSENT) return false;

  try {
    await env.CONSENT.put(consentKey(record), JSON.stringify(record, null, 2), {
      httpMetadata: { contentType: 'application/json' },
      /*
       * Listable without fetching the bodies, which is enough to audit volume
       * and date ranges. It is deliberately NOT enough to find one person's
       * records: nothing here identifies anyone, so a POPIA access or deletion
       * request means reading the objects. That is the right trade — putting a
       * name or an email in object metadata would make every listing a
       * disclosure. C-20, C-56
       */
      customMetadata: {
        topic: record.topic,
        submittedAt: record.submittedAt,
        consentVersion: record.consentVersion,
      },
    });
    return true;
  } catch (error) {
    // Code and message only. The record itself is personal data and does not
    // belong in a log line — C-20.
    const code = (error as { code?: string })?.code ?? 'unknown';
    const message = (error as { message?: string })?.message ?? '';
    console.error(`consent record failed: ${code} ${message}`);
    return false;
  }
}
