/// <reference types="@cloudflare/workers-types" />

import { isValidCronWindow, isWithinCronWindow } from './cronWindow';

export type LiveStatusEnv = {
  // Worker secrets, never build-time variables — CONCERNS.md C-18.
  YOUTUBE_API_KEY?: string;
  YOUTUBE_CHANNEL_ID?: string;
  // 5-field cron read as a *window*, not a schedule. Keep the minute field
  // `*` — CONCERNS.md C-14.
  LIVE_CHECK_CRON?: string;
  // IANA timezone the window is evaluated in.
  LIVE_CHECK_TZ?: string;
};

/**
 * Saturdays (cron day-of-week 6), 09:00-12:59. The church streams 09:00-12:30;
 * the hour field cannot express :30, and running long only permits polling —
 * C-14.
 */
const DEFAULT_CRON = '* 9-12 * * 6';
const DEFAULT_TZ = 'Africa/Johannesburg';

export type LiveStatusSource =
  | 'youtube-api'
  | 'outside-window'
  | 'not-configured'
  | 'invalid-schedule'
  | 'api-error';

export type LiveStatusResult = {
  isLive: boolean;
  source: LiveStatusSource;
  checkedAt: string;
  /**
   * The broadcast itself, when the API named one. Null whenever `isLive` is
   * false, and also when it is true but the response carried no id — the client
   * has to cope with a live stream it cannot deep-link to.
   */
  videoId: string | null;
  /** `videoId` as a watch URL, so the client never assembles YouTube URLs. */
  watchUrl: string | null;
  /** The window this was evaluated against, echoed back to make config mistakes obvious. */
  window: { cron: string; timeZone: string; open: boolean };
};

/**
 * What the upstream said: whether a broadcast is running and, when one is,
 * which video it is. `videoId` is null for a confident "not live" and also for
 * a live answer that arrived without a usable id.
 */
export type LiveAnswer = { isLive: boolean; videoId: string | null };

/**
 * Asks whether the channel is streaming. `null` means "could not tell" — a
 * network hiccup or exhausted quota — as distinct from a confident `false`.
 *
 * Injectable so the caching layer can wrap *this* rather than the whole
 * verdict: the window and credential checks must run on every request, or a
 * cached answer would keep the badge alive past the window's close — C-16.
 */
export type AskLive = (apiKey: string, channelId: string) => Promise<LiveAnswer | null>;

/** The canonical watch URL for a broadcast id. */
export function watchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export const askYouTube: AskLive = async (apiKey, channelId) => {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'id');
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('eventType', 'live');
  url.searchParams.set('type', 'video');
  url.searchParams.set('key', apiKey);
  // The channel can only be streaming one thing at a time as far as this badge
  // is concerned, and a smaller page is a smaller parse.
  url.searchParams.set('maxResults', '1');

  try {
    // Without a deadline a hung upstream holds the request until the Worker's
    // own limit kills it. `null` is the fail-closed answer C-16 already expects.
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
    const first = data.items?.[0];
    if (!first) return { isLive: false, videoId: null };
    // `type=video` should guarantee an id, but a missing one is a live stream
    // we simply cannot link to — not a reason to hide the badge.
    return { isLive: true, videoId: first.id?.videoId ?? null };
  } catch {
    return null;
  }
};

/**
 * Is the channel streaming? Spends quota only inside the configured window.
 *
 * The window and credential checks always run here, on every request. Only
 * `ask` is ever cached, by `liveStatusCache.ts` — caching this verdict instead
 * would let a result from inside the window keep the badge alive after the
 * window closed. CONCERNS.md C-16.
 */
export async function getLiveStatus(
  env: LiveStatusEnv,
  now = new Date(),
  ask: AskLive = askYouTube,
): Promise<LiveStatusResult> {
  const cron = env.LIVE_CHECK_CRON?.trim() || DEFAULT_CRON;
  const timeZone = env.LIVE_CHECK_TZ?.trim() || DEFAULT_TZ;
  const checkedAt = now.toISOString();

  const offline = { isLive: false, videoId: null, watchUrl: null } as const;

  if (!isValidCronWindow(cron, timeZone, now)) {
    return {
      ...offline,
      source: 'invalid-schedule',
      checkedAt,
      window: { cron, timeZone, open: false },
    };
  }

  const open = isWithinCronWindow(cron, now, timeZone);
  const window = { cron, timeZone, open };

  if (!open) {
    return { ...offline, source: 'outside-window', checkedAt, window };
  }

  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) {
    return { ...offline, source: 'not-configured', checkedAt, window };
  }

  const answer = await ask(env.YOUTUBE_API_KEY, env.YOUTUBE_CHANNEL_ID);
  if (answer === null) {
    // Hiccup or exhausted quota: hide the badge, let the client recover.
    return { ...offline, source: 'api-error', checkedAt, window };
  }

  const videoId = answer.isLive ? answer.videoId : null;
  return {
    isLive: answer.isLive,
    videoId,
    watchUrl: videoId ? watchUrlFor(videoId) : null,
    source: 'youtube-api',
    checkedAt,
    window,
  };
}
