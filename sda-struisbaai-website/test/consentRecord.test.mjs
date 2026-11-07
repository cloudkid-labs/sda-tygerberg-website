import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { buildConsentRecord, consentKey } from '../src/worker/consentRecord.ts';

const AT = '2026-09-08T10:00:00.000Z';
const AF_TEXT = 'Ek gee toestemming dat die kerk my besonderhede mag gebruik om my oor hierdie versoek te kontak.';
const EN_TEXT = 'I consent to the church using my details to contact me about this request.';

/*
 * The full format is the contract — C-34. The record is the POPIA evidence
 * (who agreed, when, to what wording, how to reach them); the delivered email
 * carries the same facts plus the message, quoting the record id. A 2026-09-08
 * minimization to id+email+submittedAt was reverted the same day: keep this
 * shape intact, and if it ever changes again, change the email tie-in and
 * C-34 with it.
 */
describe('buildConsentRecord', () => {
  test('keeps the full format — exact keys, no more and no fewer', () => {
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan', email: 'jan@example.com', phone: '', message: 'hallo' },
      AT,
      'af',
    );
    assert.deepEqual(Object.keys(record).sort(), [
      'consent',
      'consentLang',
      'consentText',
      'consentVersion',
      'email',
      'id',
      'name',
      'phone',
      'source',
      'submittedAt',
      'topic',
    ]);
  });

  test('passes the submission facts through', () => {
    const record = buildConsentRecord(
      { topic: 'bible-study', name: 'Jan', email: 'jan@example.com', phone: '0820000000' },
      AT,
      'en',
    );
    assert.equal(record.topic, 'bible-study');
    assert.equal(record.name, 'Jan');
    assert.equal(record.email, 'jan@example.com');
    assert.equal(record.phone, '0820000000');
    assert.equal(record.submittedAt, AT);
    assert.equal(record.source, 'tygerberg-sda-website');
    assert.ok(record.id.length > 0);
  });

  test('empty email/phone become null, never empty strings', () => {
    const record = buildConsentRecord({ topic: 'connect', name: 'Jan', email: '', phone: '' }, AT, 'af');
    assert.equal(record.email, null);
    assert.equal(record.phone, null);
  });

  test('phone-only submissions keep topic and phone beside a null email (C-34)', () => {
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan', email: '', phone: '0820000000' },
      AT,
      'af',
    );
    assert.equal(record.email, null);
    assert.equal(record.phone, '0820000000');
    assert.equal(record.topic, 'connect');
  });

  test('pins the consent facts: true, version, language, exact wording', () => {
    const af = buildConsentRecord({ topic: 'connect', name: 'Jan', email: 'j@x.co' }, AT, 'af');
    assert.equal(af.consent, true);
    assert.equal(af.consentVersion, '2026-08-08');
    assert.equal(af.consentLang, 'af');
    assert.equal(af.consentText, AF_TEXT);
    const en = buildConsentRecord({ topic: 'connect', name: 'Jan', email: 'j@x.co' }, AT, 'en');
    assert.equal(en.consentLang, 'en');
    assert.equal(en.consentText, EN_TEXT);
  });
});

describe('consentKey', () => {
  test('keeps the YYYY/MM/DD/<timestamp>-<uuid>.json shape', () => {
    const record = buildConsentRecord({ email: 'jan@example.com' }, AT, 'af');
    assert.equal(consentKey(record), `2026/09/08/${AT}-${record.id}.json`);
  });
});
