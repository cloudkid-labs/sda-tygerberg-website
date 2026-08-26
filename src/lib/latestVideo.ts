/**
 * The latest upload, for the homepage video preview. Isomorphic on purpose:
 * the Worker resolves it at request time (src/worker/latestVideo.ts) and the
 * build resolves it once at build time (src/pages/index.astro), and both must
 * read YouTube the same way or the pre- and post-hydration cards drift.
 *
 * Why this exists at all: the embed player redirect-loops through Google's
 * consent endpoint from the congregation's own region, so the card cannot
 * simply be an iframe (C-60). The preview needs the latest video's id and
 * title without the visitor's browser ever talking to Google — and YouTube's
 * RSS feed (feeds/videos.xml) answers 404 now, for every channel, so the two
 * sources left are the Data API and the embed page itself.
 */

export type LatestVideo = {
  videoId: string;
  title: string;
};

/** `UCxxxx` → `UUxxxx`: a channel's auto-generated uploads playlist. */
export function uploadsPlaylistFor(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

/** An 11-char YouTube video id, and nothing that merely resembles one. */
const VIDEO_ID = /^[\w-]{11}$/;

/** One `playlistItems` entry, the subset this cares about (`part=snippet,status`). */
export type ApiPlaylistItem = {
  snippet?: { title?: string; resourceId?: { videoId?: string } };
  status?: { privacyStatus?: string };
};

/**
 * The newest genuinely viewable upload from a `playlistItems` response.
 *
 * The uploads playlist includes private and deleted uploads — the API still
 * lists them, each carrying a `videoId`, titled "Private video" / "Deleted
 * video" — so taking `items[0]` blindly can feature one: a grey placeholder
 * whose every click dead-ends on "Video unavailable". Only `public` and
 * `unlisted` actually play for a visitor, so the first of those wins. This
 * matches the keyless embed-page path, whose playlist panel already lists only
 * playable entries — the two sources agree instead of the configured deploy
 * degrading worse. Requires `part=snippet,status`.
 */
export function pickLatestFromApiItems(items: ApiPlaylistItem[] | undefined): LatestVideo | null {
  for (const item of items ?? []) {
    const privacy = item.status?.privacyStatus;
    const videoId = item.snippet?.resourceId?.videoId;
    if (
      (privacy === 'public' || privacy === 'unlisted') &&
      typeof videoId === 'string' &&
      VIDEO_ID.test(videoId)
    ) {
      return { videoId, title: item.snippet?.title ?? '' };
    }
  }
  return null;
}

/**
 * Pull the first playlist entry out of an embed page.
 *
 * `/embed/videoseries?list=UU…` HTML carries the whole playlist panel inside
 * `"embedded_player_response"` — a JSON document escaped into a JSON string,
 * so it parses in two steps: the string literal first, then the document.
 * Fetched WITH a Referer header; without one YouTube answers Error 153
 * (EMBEDDER_IDENTITY_MISSING_REFERRER) and the panel is absent (C-60).
 *
 * Returns null on any shape it does not recognise — a YouTube markup change
 * must degrade the card, never break the page or the build.
 */
export function parseLatestFromEmbedHtml(html: string): LatestVideo | null {
  const m = /"embedded_player_response":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!m) return null;

  let doc: unknown;
  try {
    // Step one un-escapes the string literal, step two parses the document.
    doc = JSON.parse(JSON.parse(`"${m[1]}"`));
  } catch {
    return null;
  }

  type Run = { text?: unknown };
  type PanelEntry = {
    playlistPanelVideoRenderer?: {
      videoId?: unknown;
      title?: { runs?: Run[] };
    };
  };
  const contents = (doc as {
    embedPreview?: {
      thumbnailPreviewRenderer?: {
        playlist?: { playlistPanelRenderer?: { contents?: PanelEntry[] } };
      };
    };
  })?.embedPreview?.thumbnailPreviewRenderer?.playlist?.playlistPanelRenderer?.contents;

  const first = contents?.[0]?.playlistPanelVideoRenderer;
  const videoId = first?.videoId;
  if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null;

  const title = (first?.title?.runs ?? [])
    .map((run) => (typeof run.text === 'string' ? run.text : ''))
    .join('')
    .trim();

  return { videoId, title };
}

/** The page the parser above reads, for a given uploads playlist. */
export function embedPageUrl(uploadsPlaylistId: string): string {
  return `https://www.youtube.com/embed/videoseries?list=${uploadsPlaylistId}`;
}
