import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

/*
 * Routing that must stay in step with wrangler.jsonc run_worker_first (C-60):
 * masters fall back unless the transformer asks (C-51), /health answers JSON,
 * unknown paths reach ASSETS untouched.
 */

/*
 * `index.ts` (via liveStatusCache/latestVideo) reads `caches` once at import
 * time, so the stub is installed once at file scope before the import.
 */
globalThis.caches ??= {
  default: {
    async match() {
      return undefined;
    },
    async put() {},
  },
};

const realFetch = globalThis.fetch;
globalThis.fetch = async () =>
  Response.json({
    items: [{ id: { videoId: 'e7rN_P9-n2I' } }],
  });
const { default: worker } = await import('../src/worker/index.ts');
globalThis.fetch = realFetch;

let assetHits;

const env = () => ({
  ASSETS: {
    async fetch(req) {
      const pathname = new URL(req.url).pathname;
      assetHits.push(pathname);
      return new Response(`asset:${pathname}`);
    },
  },
});
const ctx = () => ({ waitUntil() {} });

beforeEach(() => {
  assetHits = [];
});

describe('headshot masters — C-51', () => {
  test('a direct master hit is rewritten to its fallback', async () => {
    const res = await worker.fetch(new Request('https://x/images/hod/jan.jpg'), env(), ctx());
    assert.deepEqual(assetHits, ['/images/hod/fallback/jan.jpg']);
    assert.match(await res.text(), /fallback\/jan\.jpg/);
  });

  test('matches .jpeg and uppercase extensions, never nested paths', async () => {
    await worker.fetch(new Request('https://x/images/hod/JAN.JPEG'), env(), ctx());
    assert.deepEqual(assetHits, ['/images/hod/fallback/JAN.JPEG']);
    await worker.fetch(new Request('https://x/images/hod/sub/jan.jpg'), env(), ctx());
    assert.deepEqual(assetHits.slice(1), ['/images/hod/sub/jan.jpg']);
  });

  test('the transformer subrequest passes through to the master', async () => {
    await worker.fetch(
      new Request('https://x/images/hod/jan.jpg', { headers: { via: 'image-resizing, envoy' } }),
      env(),
      ctx(),
    );
    assert.deepEqual(assetHits, ['/images/hod/jan.jpg']);
  });

  test('fallback copies are served as-is, never rewritten again', async () => {
    await worker.fetch(new Request('https://x/images/hod/fallback/jan.jpg'), env(), ctx());
    assert.deepEqual(assetHits, ['/images/hod/fallback/jan.jpg']);
  });
});

describe('worker branches — C-60, C-63', () => {
  test('/health answers the versioned JSON signal with no-store', async () => {
    const res = await worker.fetch(new Request('https://x/health'), env(), ctx());
    const json = await res.json();
    assert.equal(json.status, 204);
    assert.ok(json.version);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
  });

  test('a non-POST /api/contact is rejected, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/api/contact'), env(), ctx());
    assert.equal(res.status, 405);
    assert.deepEqual(assetHits, []);
  });

  test('/auth/login without secrets answers not-configured, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/auth/login'), env(), ctx());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).outcome, 'not-configured');
    assert.deepEqual(assetHits, []);
  });

  test('/api/mail/session without secrets answers not-configured, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/api/mail/session'), env(), ctx());
    assert.equal(res.status, 503);
    assert.deepEqual(assetHits, []);
  });

  test('a non-POST /api/mail/send is rejected, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/api/mail/send'), env(), ctx());
    assert.equal(res.status, 405);
    assert.deepEqual(assetHits, []);
  });

  test('/api/mail/inbox without secrets answers not-configured, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/api/mail/inbox'), env(), ctx());
    assert.equal(res.status, 503);
    assert.deepEqual(assetHits, []);
  });

  test('a non-POST /api/mail/reply is rejected, not proxied', async () => {
    const res = await worker.fetch(new Request('https://x/api/mail/reply'), env(), ctx());
    assert.equal(res.status, 405);
    assert.deepEqual(assetHits, []);
  });

  test('/api/live-status answers JSON with a source and cached flag', async () => {
    const res = await worker.fetch(new Request('https://x/api/live-status'), env(), ctx());
    const json = await res.json();
    assert.ok(['outside-window', 'not-configured'].includes(json.source), json.source);
    assert.equal(json.cached, false);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/i);
    assert.deepEqual(assetHits, []);
  });

  test('unknown paths fall through to ASSETS', async () => {
    const res = await worker.fetch(new Request('https://x/connect/'), env(), ctx());
    assert.deepEqual(assetHits, ['/connect/']);
    assert.equal(await res.text(), 'asset:/connect/');
  });
});
