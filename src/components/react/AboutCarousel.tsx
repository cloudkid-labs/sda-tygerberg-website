import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { shownDepartmentHeads, type DepartmentHeadWithPhoto } from '../../data/departmentHeads';
import type { Lang } from '../../data/site';
import {
  cdnImageUrl,
  cdnSrcset,
  headshotFallbackUrl,
  headshotSource,
  HEADSHOT_SIZES,
  HEADSHOT_WIDTHS,
  IMAGE_CDN_ENABLED,
  probeImageCdn,
  type ImageCdnStatus,
} from '../../lib/cdnImage';

const AUTOPLAY_MS = 4200;
const GAP_PX = 20;
const TRANSITION = 'transform 520ms cubic-bezier(.22,.61,.36,1)';

/** Under this, commit on direction alone — a flick, not a measured drag. */
const FLICK_MS = 300;
/** Below this it is a tap or a jitter, however brief. */
const MIN_FLICK_PX = 10;
/** For anything slower, how much of a card must be covered to commit. */
const COMMIT_RATIO = 0.22;
/**
 * Travel before a gesture is called horizontal or vertical. Small enough that
 * the lock happens before the browser finishes its own arbitration, large
 * enough that the first jittery pixel of a tap does not decide it.
 */
const AXIS_LOCK_PX = 8;

const COUNT = shownDepartmentHeads.length;

/**
 * Slot a card occupies relative to the active one: 0 is leftmost visible,
 * positive runs off to the right, negative off to the left. CONCERNS.md C-12.
 */
function slotOf(index: number, active: number) {
  const ahead = (((index - active) % COUNT) + COUNT) % COUNT;
  // Far half of the ring goes round the back, so cards also leave to the left.
  return ahead > COUNT / 2 ? ahead - COUNT : ahead;
}

/** Outside this, a card is mid-wrap and must move without animating — C-12. */
const ANIMATE_SPAN = Math.max(2, Math.floor(COUNT / 2) - 2);
const isAnimatedSlot = (slot: number) => slot >= -ANIMATE_SPAN && slot <= ANIMATE_SPAN;

// Paired with HEADSHOT_SIZES in src/lib/cdnImage.ts — CONCERNS.md C-03.
const CARD_WIDTH = 'w-[72%] sm:w-[45%] lg:w-[31%]';

/**
 * Portrait, cropped from the top: the sources are 2:3 with the head 14-19%
 * down, so this keeps every face's headroom and spends the crop on the chest.
 * Placeholder cards use the same box, so the deck's height doesn't move as
 * photos arrive.
 */
const PHOTO_ASPECT = '4/5';

/** Smallest candidate of the first photo — already in its srcset, so free. */
const PROBE_URL = shownDepartmentHeads[0]
  ? cdnImageUrl(headshotSource(shownDepartmentHeads[0].photo), HEADSHOT_WIDTHS[0])
  : null;

/**
 * Whether the edge transformer is answering: asked once, shared by every card.
 * `unknown` is optimistic and matches the server-rendered HTML. CONCERNS.md
 * C-09.
 */
function useImageCdn(): ImageCdnStatus {
  const [status, setStatus] = useState<ImageCdnStatus>(
    IMAGE_CDN_ENABLED ? 'unknown' : 'unavailable',
  );

  useEffect(() => {
    if (!IMAGE_CDN_ENABLED || !PROBE_URL) return;
    let live = true;
    probeImageCdn(PROBE_URL).then((ok) => {
      if (live) setStatus(ok ? 'available' : 'unavailable');
    });
    return () => {
      live = false;
    };
  }, []);

  return status;
}

/** Cloudflare resizes per viewport; the browser picks from `sizes`. */
function Headshot({
  name,
  photo,
  eager,
  cdn,
}: {
  name: string;
  photo: string;
  eager: boolean;
  cdn: ImageCdnStatus;
}) {
  // In state, not poked onto the DOM node, so a re-render cannot restore the
  // broken URL. Falls back to the resized copy, never the original — C-02.
  const [transformFailed, setTransformFailed] = useState(false);
  const useCdn = cdn !== 'unavailable' && !transformFailed;
  const fallback = headshotFallbackUrl(photo);

  /** `onError` misses failures that happened before hydration — C-05. */
  const catchErrorBeforeHydration = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setTransformFailed(true);
  };

  return (
    <img
      ref={catchErrorBeforeHydration}
      src={useCdn ? cdnImageUrl(headshotSource(photo), 640) : fallback}
      srcSet={useCdn ? cdnSrcset(headshotSource(photo)) : undefined}
      sizes={useCdn ? HEADSHOT_SIZES : undefined}
      alt={name}
      // Off-screen cards sit outside the track's overflow, so lazy holds them.
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setTransformFailed(true)}
      // A drag starting on a photo is the normal way to work the deck, and an
      // image is draggable by default: the browser starts its own image drag
      // and the pointer stream stops arriving mid-swipe — C-30.
      draggable={false}
      // Absolute, not `h-full` in flow — CONCERNS.md C-06.
      className="absolute inset-0 h-full w-full object-cover object-top [-webkit-touch-callout:none]"
    />
  );
}

/** `sizer` is the invisible card that gives the track its height: no image. */
function Card({
  head,
  lang,
  cdn = 'unknown',
  eager = false,
  sizer = false,
}: {
  head: DepartmentHeadWithPhoto;
  lang: Lang;
  cdn?: ImageCdnStatus;
  eager?: boolean;
  sizer?: boolean;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card bg-cream-card">
      <div
        className="relative flex flex-none items-center justify-center text-xs text-slate-muted"
        style={{
          aspectRatio: PHOTO_ASPECT,
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--color-tan) 0 10px, var(--color-tan-border) 10px 20px)',
        }}
      >
        {/* No placeholder branch: a card only exists if its photo does. The
            stripes still show through while the image is in flight. */}
        {sizer ? null : <Headshot name={head.name} photo={head.photo} eager={eager} cdn={cdn} />}
      </div>
      <div className="p-4 text-center">
        <div className="font-serif text-lg text-navy">{head.name}</div>
        {/* Stacked, not joined — three roles on one line is unreadable. */}
        <div className="mt-0.5 text-sm leading-snug text-slate">
          {head.roles[lang].map((role) => (
            <div key={role}>{role}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AboutCarousel() {
  // No headshots at all means no deck: `slotOf` takes `% COUNT` and would
  // divide by zero, and there would be nothing to show in any case. Safe ahead
  // of the hooks below because COUNT is fixed at module load, so hook order
  // cannot differ between renders.
  if (COUNT === 0) return null;

  const { lang } = useLanguage();
  const t = homeCopy[lang];

  // One probe for the whole deck, not one per card.
  const cdn = useImageCdn();

  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /**
   * `axis` is the gesture's committed direction: `?` until it has travelled
   * AXIS_LOCK_PX. `dx` is mirrored here so a cancelled gesture can still be
   * judged — the event that cancels carries no useful coordinate. All of it in
   * a ref, never state — C-11.
   */
  const dragFrom = useRef<{
    x: number;
    y: number;
    at: number;
    dx: number;
    axis: '?' | 'x' | 'y';
  } | null>(null);

  /** A ref, not the state value: read from the pointer handlers — C-11, C-13. */
  const pausedRef = useRef(false);

  /** Drag distance goes straight to the DOM, never through state — C-11. */
  const setOffset = (px: number) => {
    trackRef.current?.style.setProperty('--drag', `${px}px`);
  };

  const advance = (by: number) =>
    setActive((a) => (((a + by) % COUNT) + COUNT) % COUNT);
  const step = (dir: 1 | -1) => advance(dir);

  /** Distance one step moves: a card plus the gap after it. */
  const stepPx = () => {
    const card = trackRef.current?.querySelector<HTMLElement>('[data-card]');
    return card ? card.offsetWidth + GAP_PX : 0;
  };

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    // Pause is sticky: a later swipe must not restart the deck — C-13.
    if (pausedRef.current) return;
    timerRef.current = setInterval(() => step(1), AUTOPLAY_MS);
  };

  const togglePaused = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    // resetTimer reads the ref, so this both stops and restarts correctly.
    if (next) {
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (!reduceMotion) {
      resetTimer();
    }
  };

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReduceMotion(motion.matches);
      if (timerRef.current) clearInterval(timerRef.current);
      // Reduced motion suppresses autoplay entirely; the arrows still work.
      if (!motion.matches) resetTimer();
    };
    apply();
    motion.addEventListener('change', apply);
    return () => {
      motion.removeEventListener('change', apply);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    step(dir);
    if (!reduceMotion) resetTimer();
  };

  /**
   * Claims the horizontal gesture from the browser once it is unambiguous.
   *
   * `touch-action: pan-y` alone is not enough on WebKit: it still arbitrates a
   * slightly diagonal swipe into a page scroll and cancels the pointer stream.
   * Calling `preventDefault` on the touch itself is the only thing that stops
   * that, and it needs a **non-passive** listener — which React's `onTouchMove`
   * cannot give us, hence the manual registration.
   *
   * Only ever called once the gesture is locked horizontal, so vertical
   * scrolling is untouched.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const claimHorizontal = (e: TouchEvent) => {
      const from = dragFrom.current;
      // A second finger means a pinch: hand it straight back to the browser.
      if (!from || e.touches.length > 1) return;
      if (from.axis === 'x' && e.cancelable) e.preventDefault();
    };

    el.addEventListener('touchmove', claimHorizontal, { passive: false });
    return () => el.removeEventListener('touchmove', claimHorizontal);
  }, []);

  /** Shared by a clean release and a cancellation, so both judge identically. */
  const settle = (dx: number, elapsed: number) => {
    const width = stepPx();
    setOffset(0);
    setDragging(false);

    if (width > 0) {
      // Land where the finger left off; committing one card would rubber-band
      // a long swipe backwards.
      let by = Math.round(-dx / width);

      if (by === 0) {
        // Too short to round up, but still deliberate: a flick, or a slower
        // drag that got a decent way across.
        const flicked = elapsed < FLICK_MS && Math.abs(dx) > MIN_FLICK_PX;
        if (flicked || Math.abs(dx) > width * COMMIT_RATIO) by = dx < 0 ? 1 : -1;
      }

      if (by !== 0) advance(by);
    }

    if (!reduceMotion) resetTimer();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragFrom.current = {
      x: e.clientX,
      y: e.clientY,
      // `timeStamp`, not handler time — C-11.
      at: e.timeStamp,
      dx: 0,
      // A mouse or pen never competes with page scrolling, so there is nothing
      // to arbitrate: those own the horizontal from the first pixel.
      axis: e.pointerType === 'touch' ? '?' : 'x',
    };
    setOffset(0);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;

    const dx = e.clientX - from.x;
    from.dx = dx;

    if (from.axis === '?') {
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      from.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    // A vertical gesture belongs to the page: leave the deck where it is
    // rather than dragging it sideways under a finger that is scrolling.
    if (from.axis === 'y') return;

    setOffset(dx);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    dragFrom.current = null;

    if (from.axis === 'y') {
      setOffset(0);
      setDragging(false);
      if (!reduceMotion) resetTimer();
      return;
    }

    // Both off the event itself, so neither lags the finger — C-11.
    settle(e.clientX - from.x, e.timeStamp - from.at);
  };

  /**
   * The browser took the gesture away mid-swipe — it decided the page should
   * scroll. WebKit arbitrates far more eagerly than Blink, so on iOS this fires
   * on swipes the visitor meant, and discarding them was why the deck felt dead
   * on a phone.
   *
   * A gesture already locked horizontal has proven its intent, so it is settled
   * on the distance it reached rather than thrown away. Anything still
   * undecided, or decided vertical, snaps back as before.
   */
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    dragFrom.current = null;

    if (from.axis === 'x') {
      settle(from.dx, e.timeStamp - from.at);
      return;
    }

    setOffset(0);
    setDragging(false);
    if (!reduceMotion) resetTimer();
  };

  // Rendered invisibly in flow to give the track a height — the real cards are
  // absolutely positioned and cannot.
  const tallest = shownDepartmentHeads.reduce((a, b) =>
    b.roles[lang].length > a.roles[lang].length ? b : a,
  );

  return (
    <section id="oor" className="scroll-mt-24 bg-tan py-16">
      <div className="mx-auto max-w-content px-7">
        <h2 className="mb-2 text-center font-serif text-[34px] font-medium text-ink">
          {t.aboutHeading}
        </h2>
        <p className="mb-10 text-center text-slate">{t.aboutSub}</p>

        <div className="relative">
          <button
            type="button"
            aria-label={t.carouselPrev}
            onClick={() => nudge(-1)}
            className="absolute -left-3.5 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-navy text-white sm:flex"
          >
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            aria-label={t.carouselNext}
            onClick={() => nudge(1)}
            className="absolute -right-3.5 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-navy text-white sm:flex"
          >
            <span aria-hidden>›</span>
          </button>

          <div
            ref={trackRef}
            role="group"
            aria-roledescription="carousel"
            aria-label={t.carouselLabel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            // Vertical panning stays with the page; horizontal is the swipe.
            // `select-none` so a slow drag across a name highlights text
            // instead of moving the deck — C-30.
            className="relative touch-pan-y select-none overflow-hidden pb-2"
          >
            <div aria-hidden className={`invisible ${CARD_WIDTH}`}>
              <Card head={tallest} lang={lang} sizer />
            </div>

            {shownDepartmentHeads.map((head, index) => {
              const slot = slotOf(index, active);
              const animate = !dragging && !reduceMotion && isAnimatedSlot(slot);
              // Three cards show at the widest breakpoint; the rest are hidden
              // from assistive tech. Erring wide — hiding a visible card is the
              // worse failure.
              const offScreen = slot < 0 || slot > 2;
              return (
                <div
                  key={head.id}
                  data-card
                  aria-hidden={offScreen || undefined}
                  className={`absolute left-0 top-0 h-full ${CARD_WIDTH}`}
                  style={{
                    // `100%` is the card's own width, so the step is correct at
                    // every breakpoint without measuring. `--drag` comes from
                    // the track during a swipe — C-11.
                    transform: `translateX(calc(${slot} * (100% + ${GAP_PX}px) + var(--drag, 0px)))`,
                    transition: animate ? TRANSITION : 'none',
                  }}
                >
                  {/* `active` starts at 0, so 0-2 are the visible cards. */}
                  <Card head={head} lang={lang} cdn={cdn} eager={index < 3} />
                </div>
              );
            })}
          </div>

          {/*
            Below the deck, never over it: on a phone an overlaid arrow puts a
            tap target exactly where a thumb starts its swipe. Prev/next show
            only below `sm` where the floating arrows are hidden; pause shows at
            every width, because autoplaying content needs a stop control.
          */}
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label={t.carouselPrev}
              onClick={() => nudge(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-navy/25 text-lg text-navy sm:hidden"
            >
              <span aria-hidden>‹</span>
            </button>

            <button
              type="button"
              onClick={togglePaused}
              aria-pressed={paused}
              // Visible text is short so the row stays on one line on a narrow
              // phone; the accessible name says what it actually does.
              aria-label={paused ? t.carouselPlay : t.carouselPause}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-pill border border-navy/25 px-4 text-[13px] font-semibold text-navy"
            >
              <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
              <span aria-hidden>{paused ? t.carouselPlayShort : t.carouselPauseShort}</span>
            </button>

            <button
              type="button"
              aria-label={t.carouselNext}
              onClick={() => nudge(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-navy/25 text-lg text-navy sm:hidden"
            >
              <span aria-hidden>›</span>
            </button>
          </div>

          {/* Announced only while the deck is not moving on its own — C-13. */}
          <span className="sr-only" aria-live={paused || reduceMotion ? 'polite' : 'off'}>
            {active + 1} {t.carouselOf} {COUNT} — {shownDepartmentHeads[active].name}
          </span>
        </div>
      </div>
    </section>
  );
}
