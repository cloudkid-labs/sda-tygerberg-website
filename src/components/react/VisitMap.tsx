import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { SERVICE_TIMES, SITE, serviceRange } from '../../data/site';
import { withBase } from '../../lib/base';

export function VisitMap() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyAddress = async () => {
    /*
     * The outcome decides the label. `setCopied(true)` used to sit after the
     * catch, so an insecure context or a refused permission still said
     * "Gekopieer!" over an empty clipboard. The address is printed directly
     * above, so a failure leaves the visitor something to select by hand.
     */
    let ok = true;
    try {
      await navigator.clipboard.writeText(SITE.address);
    } catch {
      ok = false;
    }
    setCopyState(ok ? 'copied' : 'failed');
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <section id="besoek" className="scroll-mt-24 bg-tan py-16">
      <div className="mx-auto grid max-w-content grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5 px-7">
        <div className="rounded-card-lg bg-cream-card p-7 shadow-card">
          <div className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-orange">
            {t.visitEyebrow}
          </div>
          <h2 className="mb-6 font-serif text-2xl font-medium text-ink">{t.visitHeading}</h2>

          <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-slate-muted">
            {t.visitAddressLabel}
          </div>
          <p className="mb-4 text-ink">{SITE.address}</p>
          <button
            type="button"
            onClick={copyAddress}
            className={`mb-6 rounded-pill px-4 py-2 text-[12.5px] font-semibold ${
              copyState === 'copied'
                ? 'bg-navy text-white'
                : 'border border-strong text-ink hover:border-navy'
            }`}
          >
            {copyState === 'copied'
              ? t.addressCopied
              : copyState === 'failed'
              ? t.addressCopyFailed
              : t.copyAddress}
          </button>

          <div className="mb-6 flex flex-col gap-2 border-t border-subtle pt-5">
            {SERVICE_TIMES.map((entry) => (
              <div key={entry.en} className="flex justify-between text-sm">
                <span className="text-slate">{entry[lang]}</span>
                <span className="font-bold text-ink">
                  {t.saturdayShort} {serviceRange(entry)}
                </span>
              </div>
            ))}
          </div>

          <a
            href={SITE.directionsUrl}
            target="_blank"
            rel="noopener"
            className="mb-3 block rounded-pill bg-orange px-5 py-3 text-center font-semibold text-white hover:bg-orange-hover"
          >
            {t.directionsCta} →
          </a>
          <a
            href={SITE.appleMapsUrl}
            target="_blank"
            rel="noopener"
            className="block text-center text-sm font-semibold text-navy hover:text-orange"
          >
            {t.appleMapsCta}
          </a>
        </div>

        {/* Map carries no tile attribution, by decision — CONCERNS.md C-01. */}
        <div className="relative min-h-[300px] overflow-hidden rounded-card-lg">
          {/* `/map/`, not `/map.html`: the map is a page now, so this loads
              directly instead of taking a 307 first. C-47 */}
          <iframe
            src={withBase('/map/')}
            title={t.mapTitle}
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}
