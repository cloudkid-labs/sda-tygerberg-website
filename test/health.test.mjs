import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { APP_VERSION, CORE_VERSION, healthBody, healthResponse } from '../src/worker/health.ts';

const pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

describe('healthBody', () => {
  test('answers with template and Core versions and a short commit', () => {
    assert.deepEqual(healthBody('9.9.9', '1.3.0', 'abcdef0'), {
      status: 204, version: '9.9.9', templateVersion: '9.9.9', coreVersion: '1.3.0', commit: 'abcdef0',
    });
  });

  test('defaults to the package.json version', () => {
    assert.equal(healthBody().templateVersion, pkgVersion);
    assert.equal(healthBody().coreVersion, CORE_VERSION);
  });
});

describe('APP_VERSION', () => {
  test('tracks package.json — the single source of truth', () => {
    assert.equal(APP_VERSION, pkgVersion);
  });
});

describe('healthResponse', () => {
  test('serves the body as JSON over HTTP 200 with no-store', async () => {
    const res = healthResponse();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/i);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
    assert.deepEqual(await res.json(), healthBody());
  });
});
