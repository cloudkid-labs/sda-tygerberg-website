/// <reference types="@cloudflare/workers-types" />

import type { Lang } from '../data/site';

export type ConsentEnv = {
  /**
   * The `consent-cloudkid-link` R2 bucket. Optional on purpose: an unbound
   * Worker records consent in the enquiry email alone, exactly as it did before
   * this module existed, rather than failing a submission over storage.
   */
  CONSENT?: R2Bucket;
};

/**
 * Minimized pointer, not a submission copy — C-34.
 *
 * R2 has no expiry (dashboard-only, still unset), so a full copy would sit at
 * rest indefinitely. The delivered email already carries the full enquiry
 * (name/phone/topic/message/consent line plus this id as `Toestemmingsrekord`),
 * so the bucket keeps only what ties the mail to a timestamp: id, email and
 * submittedAt. Email passes through verbatim and may be empty for phone-only
 * submissions — the record is still a timestamped pointer and the email holds
 * the phone.
 */
export type ConsentRecord = {
  id: string;
  email: string;
  submittedAt: string;
};

export function buildConsentRecord(
  fields: Record<string, string>,
  submittedAt: string,
  // Kept so the signature is unchanged: the record no longer stores which
  // wording was shown (C-34) — the email carries the consent line instead.
  lang: Lang,
): ConsentRecord {
  return {
    id: crypto.randomUUID(),
    email: fields.email ?? '',
    submittedAt,
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
       * request means reading the objects. That is the right trade — putting
       * the email in object metadata would make every listing a
       * disclosure. C-20, C-56
       */
      customMetadata: {
        submittedAt: record.submittedAt,
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
