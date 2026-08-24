import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { SITE } from '../../data/site';
import { useLiveStatus } from './useLiveStatus';

export function Hero() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const { isLive, watchUrl } = useLiveStatus();

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
          {/* No badge over the video: it sat on top of the title and channel
              name YouTube draws in that corner. It lives in the bar below. */}
          <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
            {/* Deferred like the map below it. On a phone the player stacks
                under the hero copy and starts offscreen, so this genuinely
                withholds the YouTube bundle — which is larger than the whole
                first-party homepage — until it is scrolled to. A click-to-load
                poster would defer it on desktop too. C-46 */}
            <iframe
              src={SITE.youtubeUploadsEmbedUrl}
              title="Tygerberg SDA YouTube"
              loading="lazy"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
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
              href={SITE.youtubeFeaturedUrl}
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
