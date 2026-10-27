import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { SERVICE_TIMES, SITE, serviceRange } from '../../data/site';
import { Logo } from './Logo';

export function Footer() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];

  /*
   * Seeded from the build date and corrected after mount. `new Date()` during
   * render bakes the build year into the static HTML, so a site built in
   * December still says the old year in January — permanently for a reader with
   * JavaScript off, and briefly for everyone else. Same shape as the blood
   * drive seed, and for the same reason. C-36, C-44
   */
  const [year, setYear] = useState(() => Number(import.meta.env.PUBLIC_BUILD_DATE.slice(0, 4)));
  useEffect(() => setYear(new Date().getFullYear()), []);

  return (
    <footer className="bg-navy-deep text-blue-pale">
      <div className="mx-auto grid max-w-content grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-8 px-7 py-11">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-serif text-base text-white">Tygerberg SDA</span>
          </div>
          <p className="text-sm">{t.footerBlurb}</p>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-blue-muted">
            {t.footerVisit}
          </div>
          <p className="mb-1 text-sm">{SITE.address}</p>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-blue-muted">
            {t.footerTimesLabel}
          </div>
          {SERVICE_TIMES.map((entry) => (
            <div key={entry.en} className="text-sm">
              {entry[lang]} — {serviceRange(entry)}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-4 px-7 py-5 text-xs">
          <span>© {year} Tygerberg SDA</span>
          <a href="https://cloudkid.link" target="_blank" rel="noopener" className="font-semibold text-orange hover:text-white">
            {t.footerCreditBuilder}
          </a>
          <a href="https://adventist.org" target="_blank" rel="noopener" className="font-semibold text-orange hover:text-white">
            {t.footerCreditChurch}
          </a>
        </div>
      </div>
    </footer>
  );
}
