import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { APP_VERSION, healthBody, healthResponse } from '../src/worker/health.ts';

const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

describe('healthBody', () => {
  test('answers { status: 204, version }', () => {
    assert.deepEqual(healthBody('9.9.9'), { status: 204, version: '9.9.9' });
  });

  test('defaults to the package.json version', () => {
    assert.equal(healthBody().version, pkgVersion);
  });
});

describe('APP_VERSION', () => {
  test('tracks package.json — the single source of truth', () => {
    assert.equal(APP_VERSION, pkgVersion);
  });
});

describe('healthResponse', () => {
  test('serves the body as JSON over HTTP 200 with no-store', async () => {
    const res = healthResponse('9.9.9');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/i);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
    assert.deepEqual(await res.json(), { status: 204, version: '9.9.9' });
  });
});
