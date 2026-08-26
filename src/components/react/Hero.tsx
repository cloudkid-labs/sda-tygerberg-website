import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { SITE } from '../../data/site';
import type { LatestVideo } from '../../lib/latestVideo';
import { useLiveStatus } from './useLiveStatus';

/**
 * The uploads playlist named in the embed URL, so the playing iframe carries
 * the same "next services" context the old always-on embed had. Derived, not
 * retyped — one source of truth (C-35's lesson).
 */
const UPLOADS_LIST = new URL(SITE.youtubeUploadsEmbedUrl).searchParams.get('list') ?? '';

/**
 * Can this visitor's network reach YouTube's embed at all?
 *
 * Google's anti-abuse flow redirect-loops the embed through
 * google.com/index?continue=… on some networks — the congregation's own region
 * among them — bouncing a cookie in the URL because it cannot be set inside a
 * third-party frame (C-60). That is per-network and invisible from anywhere
 * else, so the only honest answer comes from the visitor's own connection.
 *
 * A no-cors probe of the embed URL, the C-09 pattern: on a clean network the
 * fetch resolves (opaque). On a looping one the redirect chain either trips
 * Chrome's loop limit or leaves the connect-src allowlist — and both reject
 * the promise, which is exactly the verdict wanted. Wrong-in-a-safe-direction:
 * a false "blocked" merely opens YouTube in a new tab.
 */
type EmbedVerdict = 'unknown' | 'ok' | 'blocked';

function useEmbedVerdict(videoId: string | null): EmbedVerdict {
  const [verdict, setVerdict] = useState<EmbedVerdict>('unknown');

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    fetch(`https://www.youtube.com/embed/${videoId}`, {
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000),
    })
      .then(() => !cancelled && setVerdict('ok'))
      .catch(() => !cancelled && setVerdict('blocked'));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return verdict;
}

/**
 * The newest upload. Seeded from the build (so the card is a real preview even
 * before hydration and on Pages, which has no Worker), refreshed from the
 * Worker where one exists — same seed-then-refresh contract as the blood
 * drives (C-36).
 */
function useLatestVideo(seed: LatestVideo | null): LatestVideo | null {
  const [video, setVideo] = useState(seed);

  useEffect(() => {
    if (import.meta.env.PUBLIC_HAS_API === 'false') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/latest-video');
        if (!res.ok) return;
        const data = (await res.json()) as { video?: LatestVideo | null };
        if (!cancelled && data.video?.videoId) setVideo(data.video);
      } catch {
        // The seed stands; a failed refresh must not blank a working card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return video;
}

export function Hero({ latestVideo = null }: { latestVideo?: LatestVideo | null }) {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const { isLive, watchUrl } = useLiveStatus();

  const video = useLatestVideo(latestVideo);
  const verdict = useEmbedVerdict(video?.videoId ?? null);
  const [playing, setPlaying] = useState(false);

  const watchHref = video
    ? `https://www.youtube.com/watch?v=${video.videoId}&list=${UPLOADS_LIST}`
    : SITE.youtubeStreamsUrl;

  return (
    <section className="mx-auto grid max-w-content grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-center gap-13 px-7 pb-10 pt-15">
      <div>
        <div className="mb-5 text-xs font-bold uppercase tracking-[.16em] text-orange">
          {t.heroEyebrow}
        </div>
        {/* The largest thing on the page, and the one line that has to land
            before anything else does. The clamp keeps it from crowding a
            narrow phone while letting it carry the hero on a desktop. */}
        <h1 className="mb-5 text-balance font-serif text-[clamp(40px,5.6vw,68px)] font-medium leading-[1.05] tracking-[-.018em] text-ink">
          {t.heroTitle}
        </h1>
        <p className="mb-7 max-w-[460px] text-[17px] leading-relaxed text-slate">{t.heroSub}</p>
        <div className="flex flex-wrap gap-3.5">
          <a
            href={SITE.directionsUrl}
            target="_blank"
            rel="noopener"
            className="rounded-pill bg-navy px-6.5 py-3.5 text-[15px] font-semibold text-white hover:bg-navy-deep"
          >
            {t.ctaVisit}
          </a>
          {/* Only while a broadcast is actually running: the rest of the week
              this invited people to a stream that was not there. It links to
              the broadcast the API named, falling back to the channel's live
              tab when the answer arrived without an id. */}
          {isLive && (
            <a
              href={watchUrl ?? SITE.youtubeLiveUrl}
              target="_blank"
              rel="noopener"
              className="group flex items-center gap-2 rounded-pill border-[1.5px] border-navy px-6.5 py-3.5 text-[15px] font-semibold text-navy hover:bg-navy hover:text-white"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-orange motion-safe:animate-pulse" />
              {t.ctaWatch}
            </a>
          )}
        </div>
      </div>

      <div id="stroom" className="scroll-mt-24">
        <div className="overflow-hidden rounded-card-lg bg-navy-deep shadow-deep">
          {/* An adaptive preview, not a bare iframe, and the shape is forced by
              measurement rather than taste. Google's consent flow redirect-
              loops the embed on some networks — the congregation's region
              among them — so an always-on iframe rendered Chrome's error page
              where the service belongs, and no embed URL fixes that from our
              side (C-60, with the whole investigation).

              So: the latest service's real thumbnail and title, resolved
              server-side so the visitor's browser never asks Google for data.
              A probe from the visitor's own network then decides the click —
              inline playback where the embed works, YouTube in a new tab where
              Google blocks it. The YouTube player bundle is only ever fetched
              after a deliberate click on a network where it can actually play
              — which is also C-46's wish, delivered. */}
          <div className="relative bg-navy-deep" style={{ aspectRatio: '16/9' }}>
            {playing && video ? (
              <iframe
                src={`https://www.youtube.com/embed/${video.videoId}?list=${UPLOADS_LIST}&autoplay=1`}
                title="Tygerberg SDA YouTube"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <a
                href={watchHref}
                target="_blank"
                rel="noopener"
                onClick={(event) => {
                  // Inline only on a proven network. 'unknown' and 'blocked'
                  // both fall through to the href — a new tab is the outcome
                  // that cannot fail.
                  if (verdict === 'ok' && video) {
                    event.preventDefault();
                    setPlaying(true);
                  }
                }}
                aria-label={video ? `${t.watchCardTitle}: ${video.title}` : t.watchCardTitle}
                className="group absolute inset-0 block"
              >
                {video && (
                  /* hqdefault always exists; maxresdefault does not for every
                     upload, and a srcset cannot fall back from a 404. The
                     letterboxing baked into the 4:3 variant is cropped away by
                     object-cover. Empty alt: the link's aria-label already
                     carries the title. */
                  <img
                    src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange shadow-deep transition-colors group-hover:bg-orange-hover">
                    {/* translate-x: a triangle centred by its bounding box
                        reads off-centre — its mass sits left of that box. */}
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-7 w-7 translate-x-[2px] fill-white"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  {!video && (
                    <span className="font-serif text-xl text-white">{t.watchCardTitle}</span>
                  )}
                  {verdict !== 'ok' && (
                    <span className="text-[12.5px] font-semibold text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]">
                      {t.watchCardHint}
                    </span>
                  )}
                </span>
                {video && (
                  /* The title sits on its own gradient so it stays legible on
                     any thumbnail — SC 1.4.3 does not pause for photography. */
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-12 text-left">
                    <span className="line-clamp-2 font-serif text-[17px] leading-snug text-white">
                      {video.title}
                    </span>
                  </span>
                )}
              </a>
            )}
          </div>
          <div className="flex items-center gap-3 p-4">
            {isLive && (
              /* Status, not an action — so no orange fill, which in this bar
                 would read as a second button beside the real one. */
              <div className="flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-[11px] font-extrabold tracking-[.08em] text-white">
                {/* motion-safe: a flashing dot is exactly what someone who asked
                    for reduced motion asked not to see. It still reads as live
                    without the pulse. */}
                <span className="h-[7px] w-[7px] rounded-full bg-live motion-safe:animate-pulse" />
                {t.liveLabel}
              </div>
            )}
            <a
              href={SITE.youtubeStreamsUrl}
              target="_blank"
              rel="noopener"
              // ml-auto rather than justify-between: the button stays right
              // whether or not the badge is there to push it.
              className="ml-auto rounded-pill bg-orange px-4.5 py-2 text-[12.5px] font-bold text-white hover:bg-orange-hover"
            >
              {t.tabReplay}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
