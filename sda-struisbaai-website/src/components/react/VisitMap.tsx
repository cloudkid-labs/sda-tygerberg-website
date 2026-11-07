import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { SITE } from '../../data/site';

export function VisitMap() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];

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
          <p className="mb-6 text-ink">{SITE.address}</p>
          <a
            href={SITE.directionsUrl}
            target="_blank"
            rel="noopener"
            className="block rounded-pill bg-orange px-5 py-3 text-center font-semibold text-white hover:bg-orange-hover"
          >
            {t.directionsCta} →
          </a>
        </div>

        <a
          href={SITE.directionsUrl}
          target="_blank"
          rel="noopener"
          className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-card-lg bg-navy p-8 text-center text-white transition-colors hover:bg-navy-deep"
        >
          <span className="text-xs font-bold uppercase tracking-[.16em] text-orange">Google Maps</span>
          <span className="font-serif text-2xl">Struisbaai Library Hall</span>
          <span className="text-sm text-blue-pale">{t.directionsCta} ↗</span>
        </a>
      </div>
    </section>
  );
}
