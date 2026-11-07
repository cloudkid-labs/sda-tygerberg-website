import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { SITE, BLOOD_DRIVES, SERVICE_TIMES } from '../src/data/site.ts';
import { churchJsonLd, websiteJsonLd } from '../src/lib/structuredData.ts';

describe('the address has one source', () => {
  test('the printed string is composed from the parts', () => {
    const p = SITE.addressParts;
    assert.equal(SITE.address, `${p.street}, ${p.suburb}, ${p.city}, ${p.postalCode}`);
  });

  test('the JSON-LD PostalAddress is composed from the same parts', () => {
    // This is the drift the parts exist to stop: every field here used to be a
    // literal, and the locality had wandered to a different town from the one
    // the site displays, under a comment claiming both read from site.ts.
    const p = SITE.addressParts;
    const { address } = churchJsonLd(new URL('https://example.test/'));
    assert.equal(address.streetAddress, `${p.street}, ${p.suburb}`);
    assert.equal(address.addressLocality, p.town);
    assert.equal(address.addressRegion, p.region);
    assert.equal(address.postalCode, p.postalCode);
    assert.equal(address.addressCountry, p.country);
  });

  test('addressCountry is an ISO 3166-1 alpha-2 code', () => {
    assert.match(SITE.addressParts.country, /^[A-Z]{2}$/);
  });
});

describe('structured data is built from the requested origin', () => {
  test('every @id and url is rooted at the site passed in', () => {
    const site = new URL('https://tygerberg-sda.example/');
    for (const node of [websiteJsonLd(site), churchJsonLd(site)]) {
      assert.equal(new URL(node['@id']).origin, site.origin);
      assert.equal(node.url, site.href);
    }
  });

  test('the geo point is the one the map uses', () => {
    const { geo } = churchJsonLd(new URL('https://example.test/'));
    assert.equal(geo.latitude, SITE.lat);
    assert.equal(geo.longitude, SITE.lng);
  });
});

describe('the blood drive roster', () => {
  test('is ISO dates, ascending, with no duplicates', () => {
    for (const date of BLOOD_DRIVES) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual([...BLOOD_DRIVES], [...BLOOD_DRIVES].sort());
    assert.equal(new Set(BLOOD_DRIVES).size, BLOOD_DRIVES.length);
  });

  test('every date is real, and a Thursday as the roster says', () => {
    for (const date of BLOOD_DRIVES) {
      const d = new Date(`${date}T00:00:00Z`);
      assert.ok(!Number.isNaN(d.getTime()), `${date} is not a date`);
      assert.equal(d.getUTCDay(), 4, `${date} is not a Thursday`);
    }
  });
});

describe('service times', () => {
  test('each entry is bilingual and ordered start before end', () => {
    for (const entry of SERVICE_TIMES) {
      assert.ok(entry.af.length > 0 && entry.en.length > 0);
      assert.ok(entry.start < entry.end, `${entry.en}: ${entry.start} is not before ${entry.end}`);
    }
  });
});
