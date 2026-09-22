import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import {
  buildConsentRecord,
  consentKey,
  storeConsent,
  CONSENT_VERSION,
} from '../src/worker/consentRecord.ts';

/*
 * Storage is the POPIA evidence (C-34) but never blocks delivery, and listings
 * must not disclose anyone (C-20): metadata carries facts, never identities.
 */

const AT = '2026-09-08T10:00:00.000Z';

function bucket({ failWith = null } = {}) {
  const puts = [];
  return {
    puts,
    bucket: {
      async put(key, body, options) {
        if (failWith) throw failWith;
        puts.push({ key, body, options });
      },
    },
  };
}

const realError = console.error;
let errored;

beforeEach(() => {
  errored = [];
  console.error = (...args) => errored.push(args.join(' '));
});

afterEach(() => {
  console.error = realError;
});

describe('storeConsent', () => {
  test('false where no bucket is bound, putting nothing', async () => {
    assert.equal(
      await storeConsent({}, buildConsentRecord({ topic: 'connect' }, AT, 'af')),
      false,
    );
  });

  test('stores the record as JSON under the date-prefixed key', async () => {
    const b = bucket();
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan', email: 'jan@example.com', phone: '' },
      AT,
      'af',
    );
    assert.equal(await storeConsent({ CONSENT: b.bucket }, record), true);
    assert.equal(b.puts.length, 1);
    assert.equal(b.puts[0].key, consentKey(record));
    assert.deepEqual(JSON.parse(b.puts[0].body), { ...record, id: record.id });
    assert.equal(b.puts[0].options.httpMetadata.contentType, 'application/json');
  });

  test('custom metadata carries facts for listing, never identities — C-20', async () => {
    const b = bucket();
    const record = buildConsentRecord(
      { topic: 'bible-study', name: 'Jan', email: 'jan@example.com', phone: '082' },
      AT,
      'en',
    );
    await storeConsent({ CONSENT: b.bucket }, record);
    assert.deepEqual(b.puts[0].options.customMetadata, {
      topic: 'bible-study',
      submittedAt: AT,
      consentVersion: CONSENT_VERSION,
    });
  });

  test('false on a put failure, logging the fault without personal data — C-20', async () => {
    const b = bucket({ failWith: Object.assign(new Error('r2 down'), { code: 'E_R2' }) });
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan Smit', email: 'jan@example.com', phone: '' },
      AT,
      'af',
    );
    assert.equal(await storeConsent({ CONSENT: b.bucket }, record), false);
    assert.match(errored.join('\n'), /consent record failed/);
    assert.doesNotMatch(errored.join('\n'), /Jan Smit/);
    assert.doesNotMatch(errored.join('\n'), /jan@example\.com/);
  });
});

describe('consent record minimization — C-20', () => {
  test('the free-text message is never stored', () => {
    const record = buildConsentRecord(
      { topic: 'connect', name: 'Jan', email: 'j@x.co', message: 'very personal words' },
      AT,
      'af',
    );
    assert.ok(!('message' in record));
  });

  test('keys nest under YYYY/MM/DD so a retention sweep works on prefix', () => {
    const record = buildConsentRecord({ topic: 'connect' }, AT, 'af');
    assert.ok(consentKey(record).startsWith('2026/09/08/'));
    assert.match(consentKey(record), /\.json$/);
  });
});
