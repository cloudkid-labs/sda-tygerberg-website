/// <reference types="@cloudflare/workers-types" />

import {
  askYouTube,
  getLiveStatus,
  type AskLive,
  type LiveAnswer,
  type LiveStatusEnv,
  type LiveStatusResult,
} from './liveStatus';

/** How long one upstream answer is reused — CONCERNS.md C-16. */
export const LIVE_CACHE_SECONDS = 60;

/**
 * Cache key path. Only ever used as a key, never routed, and deliberately built
 * from the incoming origin: the Workers Cache API is keyed by URL and will not
 * store an entry for a host outside the zone.
 *
 * A fixed path rather than the request's own URL, because a client appending a
 * cache-busting query would otherwise get an entry each — exactly the
 * multiplication this exists to stop.
 */
const CACHE_PATH = '/__live-status';

/**
 * `caches.default` is a Workers extension. This project's tsconfig also pulls in
 * lib.dom — Astro's strict preset, which the React islands need — and the DOM
 * `CacheStorage` has no `default`, so the global resolves to the wrong shape.
 * Narrowed here rather than widening the whole project's lib configuration for
 * one property.
 */
const workerCaches = caches as unknown as { default: Cache };

/**
 * What goes in the cache: the upstream answer alone, `answer: null` meaning
 * "could not tell". Wrapped in an object because a bare `null` body is
 * indistinguishable from a parse failure once it has been through JSON.
 */
type CachedAnswer = { answer: LiveAnswer | null };

/**
 * `getLiveStatus`, with the *upstream call* shared by every viewer in a colo for
 * `LIVE_CACHE_SECONDS`.
 *
 * `search.list` costs 100 quota units against a 10,000/day default — about 100
 * calls a day. The client polls every 5 minutes and each viewer used to spend
 * separately, so a 30-person hour cost ~360 calls and blew the day's quota three
 * times over. Sharing the answer makes that ~60.
 *
 * **Only `ask` is cached, never the verdict.** The window and credential checks
 * run on every request, so the badge cannot outlive the window by up to the TTL
 * — which is what happened when this wrapped the whole verdict instead.
 *
 * A `null` answer is cached too, on purpose: when quota *is* exhausted, retrying
 * on every request is the worst available behaviour.
 *
 * The cache is per-colo, so the real figure is 60 × colos in play; for one
 * congregation in Cape Town that is usually one. Concurrent misses can still
 * stampede — arrivals spread across a 5-minute poll, so that is a few extra
 * calls at the start of a service, not a multiplier.
 */
export async function getLiveStatusCached(
  request: Request,
  env: LiveStatusEnv,
  ctx: ExecutionContext,
  now = new Date(),
): Promise<{ result: LiveStatusResult; cached: boolean }> {
  const cache = workerCaches.default;
  const key = new Request(new URL(CACHE_PATH, request.url).toString(), { method: 'GET' });

  let cached = false;

  const ask: AskLive = async (apiKey, channelId) => {
    const hit = await cache.match(key);
    if (hit) {
      cached = true;
      return ((await hit.json()) as CachedAnswer).answer;
    }

    const answer = await askYouTube(apiKey, channelId);
    const stored = new Response(JSON.stringify({ answer } satisfies CachedAnswer), {
      headers: {
        'Content-Type': 'application/json',
        // s-maxage: this entry is read by the Worker, never by a browser.
        'Cache-Control': `s-maxage=${LIVE_CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(key, stored));
    return answer;
  };

  // `ask` runs only if the window is open and the credentials are present, so a
  // closed window never reads the cache and never reports `cached`.
  const result = await getLiveStatus(env, now, ask);
  return { result, cached };
}
