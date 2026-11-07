import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { getLiveStatus, askYouTube, watchUrlFor } from '../src/worker/liveStatus.ts';

/*
 * The window and credential checks run on every request; only the upstream
 * call is ever cached — C-16. These pin the branch order: schedule, window,
 * credentials, upstream.
 */

const TZ = 'Africa/Johannesburg';
/** 2026-08-22 is a Saturday. SAST is UTC+2, no DST. */
const sat = (hour, minute = 0) => new Date(Date.UTC(2026, 7, 22, hour - 2, minute));
/** 2026-08-23, a Sunday. */
const sun = (hour, minute = 0) => new Date(Date.UTC(2026, 7, 23, hour - 2, minute));

const OPEN = { LIVE_CHECK_CRON: '* 9-12 * * 6', LIVE_CHECK_TZ: TZ };
const CREDS = { YOUTUBE_API_KEY: 'key', YOUTUBE_CHANNEL_ID: 'UCtZlioPBBORWMMMSJ9BE1Wg' };

const blowUp = async () => {
  throw new Error('ask must not run here');
};

describe('watchUrlFor', () => {
  test('names the watch URL for a broadcast id', () => {
    assert.equal(watchUrlFor('e7rN_P9-n2I'), 'https://www.youtube.com/watch?v=e7rN_P9-n2I');
  });

  test('encodes ids rather than concatenating them', () => {
    assert.equal(watchUrlFor('a?b&c'), 'https://www.youtube.com/watch?v=a%3Fb%26c');
  });
});

describe('getLiveStatus branches', () => {
  test('invalid-schedule on a bad cron or unknown timezone', async () => {
    for (const env of [
      { ...OPEN, ...CREDS, LIVE_CHECK_CRON: 'bogus' },
      { ...OPEN, ...CREDS, LIVE_CHECK_TZ: 'Not/AZone' },
    ]) {
      const res = await getLiveStatus(env, sat(10), blowUp);
      assert.equal(res.source, 'invalid-schedule');
      assert.equal(res.isLive, false);
      assert.equal(res.window.open, false);
    }
  });

  test('outside-window on a Sunday, without calling the upstream', async () => {
    const res = await getLiveStatus({ ...OPEN, ...CREDS }, sun(10), blowUp);
    assert.equal(res.source, 'outside-window');
    assert.deepEqual([res.isLive, res.videoId, res.watchUrl], [false, null, null]);
    assert.equal(res.window.open, false);
  });

  test('outside-window before the hours on a Saturday', async () => {
    const res = await getLiveStatus({ ...OPEN, ...CREDS }, sat(8), blowUp);
    assert.equal(res.source, 'outside-window');
  });

  test('not-configured inside the window without credentials', async () => {
    for (const env of [
      { ...OPEN },
      { ...OPEN, YOUTUBE_API_KEY: 'key' },
      { ...OPEN, YOUTUBE_CHANNEL_ID: 'UCtZlioPBBORWMMMSJ9BE1Wg' },
    ]) {
      const res = await getLiveStatus(env, sat(10), blowUp);
      assert.equal(res.source, 'not-configured', JSON.stringify(env));
      assert.equal(res.window.open, true);
    }
  });

  test('empty cron/tz fall back to the deployed Saturday window', async () => {
    const ask = async () => ({ isLive: false, videoId: null });
    const res = await getLiveStatus({ ...CREDS }, sat(10), ask);
    assert.equal(res.source, 'youtube-api');
    assert.equal(res.window.cron, '* 9-12 * * 6');
    assert.equal(res.window.timeZone, TZ);
  });

  test('live with an id links to the broadcast', async () => {
    const now = sat(10);
    const res = await getLiveStatus(
      { ...OPEN, ...CREDS },
      now,
      async () => ({ isLive: true, videoId: 'e7rN_P9-n2I' }),
    );
    assert.equal(res.source, 'youtube-api');
    assert.equal(res.isLive, true);
    assert.equal(res.videoId, 'e7rN_P9-n2I');
    assert.equal(res.watchUrl, 'https://www.youtube.com/watch?v=e7rN_P9-n2I');
    assert.equal(res.checkedAt, now.toISOString());
  });

  test('live without an id shows the badge with no link', async () => {
    const res = await getLiveStatus(
      { ...OPEN, ...CREDS },
      sat(10),
      async () => ({ isLive: true, videoId: null }),
    );
    assert.equal(res.isLive, true);
    assert.equal(res.videoId, null);
    assert.equal(res.watchUrl, null);
  });

  test('not-live forces the id to null even where the answer carries one', async () => {
    const res = await getLiveStatus(
      { ...OPEN, ...CREDS },
      sat(10),
      async () => ({ isLive: false, videoId: 'e7rN_P9-n2I' }),
    );
    assert.equal(res.isLive, false);
    assert.equal(res.videoId, null);
    assert.equal(res.watchUrl, null);
  });

  test('api-error when the upstream cannot tell', async () => {
    const res = await getLiveStatus({ ...OPEN, ...CREDS }, sat(10), async () => null);
    assert.equal(res.source, 'api-error');
    assert.equal(res.isLive, false);
  });
});

describe('askYouTube', () => {
  const realFetch = globalThis.fetch;
  let seenUrl;

  beforeEach(() => {
    seenUrl = null;
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('asks for one live video on the channel', async () => {
    globalThis.fetch = async (url) => {
      seenUrl = String(url);
      return Response.json({ items: [] });
    };
    assert.deepEqual(await askYouTube('key', 'UCtZlioPBBORWMMMSJ9BE1Wg'), {
      isLive: false,
      videoId: null,
    });
    const params = new URL(seenUrl).searchParams;
    assert.equal(params.get('channelId'), 'UCtZlioPBBORWMMMSJ9BE1Wg');
    assert.equal(params.get('eventType'), 'live');
    assert.equal(params.get('type'), 'video');
    assert.equal(params.get('maxResults'), '1');
    assert.equal(params.get('key'), 'key');
  });

  test('live with the broadcast id, missing id stays live but unlinkable', async () => {
    globalThis.fetch = async () =>
      Response.json({ items: [{ id: { videoId: 'e7rN_P9-n2I' } }] });
    assert.deepEqual(await askYouTube('k', 'UCtZlioPBBORWMMMSJ9BE1Wg'), {
      isLive: true,
      videoId: 'e7rN_P9-n2I',
    });
    globalThis.fetch = async () => Response.json({ items: [{ id: {} }] });
    assert.deepEqual(await askYouTube('k', 'UCtZlioPBBORWMMMSJ9BE1Wg'), {
      isLive: true,
      videoId: null,
    });
  });

  test('null on refusal, HTTP error, or network fault', async () => {
    globalThis.fetch = async () => new Response('no', { status: 403 });
    assert.equal(await askYouTube('k', 'UCtZlioPBBORWMMMSJ9BE1Wg'), null);
    globalThis.fetch = async () => {
      throw new Error('down');
    };
    assert.equal(await askYouTube('k', 'UCtZlioPBBORWMMMSJ9BE1Wg'), null);
  });
});

/*
 * `liveStatusCache.ts` reads `caches` once at import time, so the stub must be
 * installed once at file scope — a per-test stub would be silently ignored
 * after the first import. One shared store, cleared per test.
 */
const liveCacheStore = new Map();
globalThis.caches ??= {
  default: {
    async match(key) {
      if (!liveCacheStore.has(key.url)) return undefined;
      return new Response(liveCacheStore.get(key.url), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
    async put(key, res) {
      liveCacheStore.set(key.url, await res.text());
    },
  },
};
const { getLiveStatusCached } = await import('../src/worker/liveStatusCache.ts');

describe('getLiveStatusCached — only ask is cached, C-16', () => {
  const realFetch = globalThis.fetch;
  let fetchCalls;
  let waited;

  beforeEach(() => {
    fetchCalls = 0;
    waited = [];
    liveCacheStore.clear();
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return Response.json({ items: [{ id: { videoId: 'e7rN_P9-n2I' } }] });
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const ctx = () => ({ waitUntil(p) { waited.push(p); return p; } });
  const req = () => new Request('https://sdatygerberg.co.za/api/live-status');
  const flush = () => Promise.all(waited.splice(0));

  test('the second viewer in a colo is served from cache', async () => {
    const env = { ...OPEN, ...CREDS };
    const first = await getLiveStatusCached(req(), env, ctx(), sat(10));
    await flush();
    assert.equal(first.cached, false);
    assert.equal(first.result.isLive, true);
    const second = await getLiveStatusCached(req(), env, ctx(), sat(10, 1));
    assert.equal(second.cached, true);
    assert.equal(second.result.videoId, 'e7rN_P9-n2I');
    assert.equal(fetchCalls, 1);
  });

  test('a closed window never reads the cache and never reports cached', async () => {
    const env = { ...OPEN, ...CREDS };
    await getLiveStatusCached(req(), env, ctx(), sat(10));
    await flush();
    assert.equal(fetchCalls, 1);
    const sunday = await getLiveStatusCached(req(), env, ctx(), sun(10));
    assert.equal(sunday.result.source, 'outside-window');
    assert.equal(sunday.cached, false);
    assert.equal(fetchCalls, 1);
  });

  test('a null answer is cached too — quota exhaustion must not retry per visitor', async () => {
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response('quota', { status: 403 });
    };
    const env = { ...OPEN, ...CREDS };
    const first = await getLiveStatusCached(req(), env, ctx(), sat(10));
    await flush();
    assert.equal(first.result.source, 'api-error');
    assert.equal(first.cached, false);
    const second = await getLiveStatusCached(req(), env, ctx(), sat(10, 1));
    assert.equal(second.result.source, 'api-error');
    assert.equal(second.cached, true);
    assert.equal(fetchCalls, 1);
  });
});
