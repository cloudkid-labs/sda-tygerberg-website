/// <reference types="@cloudflare/workers-types" />

import {
  embedPageUrl,
  parseLatestFromEmbedHtml,
  pickLatestFromApiItems,
  uploadsPlaylistFor,
  type ApiPlaylistItem,
  type LatestVideo,
} from '../lib/latestVideo';

export type LatestVideoEnv = {
  YOUTUBE_API_KEY?: string;
  YOUTUBE_CHANNEL_ID?: string;
};

/**
 * How long one answer is reused. Half an hour, not C-16's sixty seconds: the
 * newest upload changes weekly, and a preview that lags a fresh upload by
 * thirty minutes costs nothing, where an API call per visitor would cost
 * quota the LIVE badge is already budgeting (C-14).
 */
export const LATEST_VIDEO_CACHE_SECONDS = 1800;

/** Fixed cache-key path, for the same reason as liveStatusCache's (C-16). */
const CACHE_PATH = '/__latest-video';

/** Same narrowing as liveStatusCache: `caches.default` is a Workers extension. */
const workerCaches = caches as unknown as { default: Cache };

type CachedVideo = { video: LatestVideo | null };

/**
 * The Data API when the key is configured — stable, documented, one quota
 * unit. `playlistItems` on the auto-generated uploads playlist, newest first.
 *
 * `part=snippet,status` and a handful of results, not one: the uploads
 * playlist lists private and deleted uploads too (each still carrying a
 * videoId), and the newest can be one. `pickLatestFromApiItems` takes the
 * first genuinely viewable entry so a "Private video" is never featured.
 */
async function askApi(apiKey: string, channelId: string): Promise<LatestVideo | null> {
  const playlist = uploadsPlaylistFor(channelId);
  if (!playlist) return null;

  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,status');
  url.searchParams.set('playlistId', playlist);
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('key', apiKey);

  try {
    // Same deadline reasoning as askYouTube in liveStatus.ts.
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ApiPlaylistItem[] };
    return pickLatestFromApiItems(data.items);
  } catch {
    return null;
  }
}

/**
 * Keyless fallback: read the embed page the way a browser would and take the
 * first playlist entry. Server-side, from Cloudflare's egress — the visitor's
 * browser never talks to Google here, which is the entire reason the preview
 * works where the embed does not (C-60). The Referer is required: without it
 * YouTube answers Error 153 and the playlist panel is absent.
 */
async function askEmbedPage(uploadsPlaylistId: string, referer: string): Promise<LatestVideo | null> {
  try {
    const res = await fetch(embedPageUrl(uploadsPlaylistId), {
      headers: { Referer: referer },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return parseLatestFromEmbedHtml(await res.text());
  } catch {
    return null;
  }
}

/**
 * The uploads playlist named in the embed URL the site was built with — the
 * fallback source of truth when YOUTUBE_CHANNEL_ID is not configured, so the
 * endpoint still answers on an unconfigured deploy.
 */
const FALLBACK_UPLOADS = 'UUtZlioPBBORWMMMSJ9BE1Wg';

export async function getLatestVideoCached(
  request: Request,
  env: LatestVideoEnv,
  ctx: ExecutionContext,
): Promise<{ video: LatestVideo | null; cached: boolean }> {
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(`${origin}${CACHE_PATH}`);
  const cache = workerCaches.default;

  const hit = await cache.match(cacheKey);
  if (hit) {
    try {
      const { video } = (await hit.json()) as CachedVideo;
      return { video, cached: true };
    } catch {
      // A corrupt entry is a miss, not an error.
    }
  }

  const uploads =
    (env.YOUTUBE_CHANNEL_ID && uploadsPlaylistFor(env.YOUTUBE_CHANNEL_ID)) || FALLBACK_UPLOADS;

  let video: LatestVideo | null = null;
  if (env.YOUTUBE_API_KEY && env.YOUTUBE_CHANNEL_ID) {
    video = await askApi(env.YOUTUBE_API_KEY, env.YOUTUBE_CHANNEL_ID);
  }
  if (!video) {
    video = await askEmbedPage(uploads, origin + '/');
  }

  // A null is cached too: a broken upstream must not be re-asked per visitor.
  const body: CachedVideo = { video };
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(body), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `s-maxage=${LATEST_VIDEO_CACHE_SECONDS}`,
        },
      }),
    ),
  );

  return { video, cached: false };
}
