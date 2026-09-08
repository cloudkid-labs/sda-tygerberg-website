import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { buildConsentRecord, consentKey } from '../src/worker/consentRecord.ts';

const AT = '2026-09-08T10:00:00.000Z';

describe('buildConsentRecord', () => {
  test('holds only id, email and submittedAt — no other keys', () => {
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan', email: 'jan@example.com', phone: '', message: 'hallo' },
      AT,
      'af',
    );
    assert.deepEqual(record, { id: record.id, email: 'jan@example.com', submittedAt: AT });
    assert.deepEqual(Object.keys(record).sort(), ['email', 'id', 'submittedAt']);
  });

  test('id is a non-empty string', () => {
    const record = buildConsentRecord({ email: 'jan@example.com' }, AT, 'en');
    assert.equal(typeof record.id, 'string');
    assert.ok(record.id.length > 0);
  });

  test('submittedAt passes through as the ISO string given', () => {
    const record = buildConsentRecord({ email: 'jan@example.com' }, AT, 'af');
    assert.equal(record.submittedAt, AT);
    assert.equal(new Date(record.submittedAt).toISOString(), AT);
  });

  test('email passes through verbatim, including empty for phone-only input', () => {
    const withEmail = buildConsentRecord({ email: '  JAN@Example.COM  ' }, AT, 'af');
    assert.equal(withEmail.email, '  JAN@Example.COM  ');
    const phoneOnly = buildConsentRecord({ email: '', phone: '0820000000' }, AT, 'af');
    assert.equal(phoneOnly.email, '');
  });
});

describe('consentKey', () => {
  test('keeps the YYYY/MM/DD/<timestamp>-<uuid>.json shape', () => {
    const record = buildConsentRecord({ email: 'jan@example.com' }, AT, 'af');
    assert.equal(consentKey(record), `2026/09/08/${AT}-${record.id}.json`);
  });
});
