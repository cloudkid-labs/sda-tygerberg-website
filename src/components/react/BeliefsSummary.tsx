import { useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { beliefCategories } from '../../data/beliefs';
import { homeCopy } from '../../data/homeCopy';
import { withBase } from '../../lib/base';

export function BeliefsSummary() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const [openIndex, setOpenIndex] = useState(0);
  const panelId = useId();

  return (
    <section id="glo" className="mx-auto grid max-w-content scroll-mt-24 grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-13 px-7 py-16">
      <div className="self-start md:sticky md:top-25">
        <div className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-orange">
          {lang === 'af' ? '28 FUNDAMENTELE LEERSTELLINGS' : '28 FUNDAMENTAL BELIEFS'}
        </div>
        <h2 className="mb-4 font-serif text-[34px] font-medium text-ink">{t.beliefsHeading}</h2>
        <p className="mb-7 text-slate">{t.beliefsSub}</p>
        <a
          href={withBase('/beliefs/')}
          className="inline-block rounded-pill bg-orange px-5.5 py-3 font-semibold text-white hover:bg-orange-hover"
        >
          {t.beliefRead}
        </a>
      </div>

      {/*
        The six themes come from beliefCategories, which /beliefs already
        renders. They used to be a second copy in homeCopy — six names and six
        descriptions in both languages, 24 strings that happened to match and
        had nothing keeping them that way.
      */}
      <div className="flex flex-col gap-2.5">
        {beliefCategories.map((category, i) => {
          const title = category.name[lang];
          const open = openIndex === i;
          return (
            <div key={title} className="overflow-hidden rounded-card border border-subtle bg-cream-card">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : i)}
                aria-expanded={open}
                aria-controls={`${panelId}-${i}`}
                className="flex w-full items-center justify-between gap-4 px-5.5 py-5 text-left font-inherit"
              >
                <span className="flex items-center gap-3.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy/10 font-serif text-xs font-bold text-navy">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-serif text-[23px] text-ink">{title}</span>
                </span>
                {/* Decorative: aria-expanded already conveys the state, and a
                    screen reader reading "plus" adds nothing. */}
                <span aria-hidden className="flex-none text-2xl font-light text-navy">
                  {open ? '–' : '+'}
                </span>
              </button>
              {/* Always rendered, hidden when collapsed — see C-43. */}
              <div
                id={`${panelId}-${i}`}
                hidden={!open}
                className="px-5.5 pb-5.5 pl-15 text-[15px] leading-relaxed text-slate"
              >
                {category.desc[lang]}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
