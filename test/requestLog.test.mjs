import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
  clipUserAgent,
  requestFacts,
  requestLogEntry,
  requestLogLine,
} from '../src/worker/requestLog.ts';

/*
 * The line is the whole feature — nothing reads it back, so a wrong field is
 * invisible until someone is staring at a tail looking for an address. These
 * pin the shape, the placeholders, and the two ways attacker-controlled input
 * could otherwise rewrite the log.
 */

const CF = { colo: 'JNB', country: 'ZA', city: 'Cape Town', asn: 20011 };

/** A request as Cloudflare hands it over, minus the parts nothing reads. */
const cfRequest = (headers = {}, url = 'https://sdatygerberg.co.za/connect/?gaan=1') => ({
  url,
  method: 'GET',
  headers: new Headers({
    'cf-connecting-ip': '196.210.35.123',
    'cf-ray': 'a3f37535597f73c6-JNB',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0',
    ...headers,
  }),
  cf: CF,
});

describe('requestFacts', () => {
  test('names the connecting address, the colo, and the host', () => {
    const facts = requestFacts(cfRequest(), 200, 12);
    assert.equal(facts.ip, '196.210.35.123');
    assert.equal(facts.country, 'ZA');
    assert.equal(facts.colo, 'JNB');
    assert.equal(facts.host, 'sdatygerberg.co.za');
    assert.equal(facts.ray, 'a3f37535597f73c6-JNB');
    assert.equal(facts.status, 200);
    assert.equal(facts.ms, 12);
  });

  test('drops the query string — it is not the line’s business', () => {
    const facts = requestFacts(cfRequest(), 200, 1);
    assert.equal(facts.path, '/connect/');
    assert.doesNotMatch(requestLogLine(facts), /gaan/);
  });

  test('a request with no Cloudflare fields still prints placeholders', () => {
    // The wrong-data fixture: a local `wrangler dev` request, or a test, has
    // neither `cf` nor the edge headers. Blank fields would read as a bug in
    // the logger itself, so absence has to be spelled.
    const bare = { url: 'http://localhost:8787/health', method: 'GET', headers: new Headers() };
    const facts = requestFacts(bare, 204, 3);
    assert.equal(facts.ip, '-');
    assert.equal(facts.country, '-');
    assert.equal(facts.colo, '-');
    assert.equal(facts.ray, '-');
    assert.equal(facts.ua, '-');
    assert.match(requestLogLine(facts), /ip=- country=- colo=-/);
  });
});

describe('clipUserAgent', () => {
  test('clips a long user agent rather than logging it whole', () => {
    const clipped = clipUserAgent('x'.repeat(400));
    assert.equal(clipped.length, 101); // 100 + the ellipsis
    assert.match(clipped, /…$/);
  });

  test('a missing or empty user agent is a placeholder, not a blank', () => {
    assert.equal(clipUserAgent(null), '-');
    assert.equal(clipUserAgent(''), '-');
    assert.equal(clipUserAgent('   '), '-');
  });
});

describe('requestLogLine', () => {
  test('is one line, and stays one line whatever the visitor sends', () => {
    // A real `Headers` cannot hold a newline — the runtime refuses it before
    // the Worker runs — so this fixture hands the logger the one shape it
    // could never receive from the edge. Belt and braces, tested.
    const forged = {
      url: 'https://sdatygerberg.co.za/',
      method: 'GET',
      headers: {
        get: (name) => {
          if (name === 'user-agent') {
            return 'curl/8\nrequest: ip=10.0.0.1 country=XX colo=XX host=x';
          }
          return name === 'cf-connecting-ip' ? '196.210.35.123' : null;
        },
      },
    };
    const line = requestLogLine(requestFacts(forged, 200, 1));
    assert.equal(line.split('\n').length, 1);
    assert.equal(line.split('\r').length, 1);
    // The forged text is flattened into the ua field. It is still *present* —
    // the point is that it cannot start a line, so nothing reading the log
    // can mistake it for a second request.
    assert.equal(line.match(/(^|\n)request:/g).length, 1);
    assert.match(line, /^request: ip=196\.210\.35\.123 /);
  });

  test('carries the fields in a greppable order', () => {
    const line = requestLogLine(requestFacts(cfRequest(), 404, 31));
    assert.match(
      line,
      /^request: ip=196\.210\.35\.123 country=ZA colo=JNB host=sdatygerberg\.co\.za method=GET path=\/connect\/ status=404 ms=31 ray=[0-9a-f]+-JNB ua=Mozilla\//,
    );
  });
});

describe('requestLogEntry', () => {
  test('states its level, rather than leaving it to the console method', () => {
    const entry = JSON.parse(requestLogEntry(requestFacts(cfRequest(), 200, 12)));
    assert.equal(entry.level, 'log');
  });

  test('the fields are top-level, so Workers Logs can index them', () => {
    const entry = JSON.parse(requestLogEntry(requestFacts(cfRequest(), 404, 3)));
    assert.equal(entry.ip, '196.210.35.123');
    assert.equal(entry.country, 'ZA');
    assert.equal(entry.status, 404);
    assert.equal(entry.path, '/connect/');
    assert.match(entry.message, /^request: ip=196\.210\.35\.123 /);
  });

  test('a forged user agent cannot break the line, escapes included', () => {
    const forged = {
      url: 'https://sdatygerberg.co.za/',
      method: 'GET',
      headers: {
        get: (name) =>
          name === 'user-agent' ? 'curl/8\nrequest: ip=10.0.0.1 country=XX' : null,
      },
    };
    const entry = requestLogEntry(requestFacts(forged, 200, 1));
    assert.equal(entry.split('\n').length, 1);
    assert.equal(JSON.parse(entry).level, 'log');
  });
});
