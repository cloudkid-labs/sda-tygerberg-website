import { useState } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { beliefsCopy } from '../../data/beliefsCopy';
import { beliefCategories } from '../../data/beliefs';
import { SITE } from '../../data/site';
import { withBase } from '../../lib/base';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

function BeliefsContent() {
  const { lang } = useLanguage();
  const t = beliefsCopy[lang];
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">

      <section className="mx-auto max-w-[780px] px-7 pb-8 pt-16 text-center">
        <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">
          {t.eyebrow}
        </div>
        <h1 className="mb-4 text-balance font-serif text-[clamp(30px,5vw,44px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
          {t.heading}
        </h1>
        <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
        <p className="mx-auto mb-5.5 max-w-[600px] text-[16.5px] leading-relaxed text-slate">
          {t.sub}
        </p>
        <a
          href={withBase(SITE.beliefsPdfPath)}
          download
          className="inline-flex items-center gap-2 rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy hover:bg-navy hover:text-white"
        >
          {t.pdfCta} ↓
        </a>
      </section>

      {/* Two offsets, because SubPageHeader has two heights: py-2.5 makes it 63px
          and py-3.5 makes it 71.5px from sm up. A single 63px parked this bar
          8.5px behind the header on every viewport above 640px, and the header
          wins at z-50. C-42 */}
      <div className="sticky top-[63px] sm:top-[71.5px] z-40 border-b border-subtle bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-content-narrow flex-wrap justify-center gap-2.5 px-7 py-3.5">
          {beliefCategories.map((cat, i) => (
            <a
              key={cat.name.en}
              href={`#cat-${i}`}
              className="rounded-pill border border-strong bg-cream-card px-4 py-2 text-xs font-bold text-navy hover:border-orange hover:text-orange"
            >
              {cat.name[lang]}
            </a>
          ))}
        </div>
      </div>

      {beliefCategories.map((cat, ci) => (
        <section
          key={cat.name.en}
          id={`cat-${ci}`}
          className="mx-auto max-w-[820px] scroll-mt-32 px-7 py-14"
        >
          <div className="mb-8 border-l-[3px] border-blue-muted pl-4.5">
            <div className="mb-2.5 inline-flex rounded-pill bg-blue-muted/30 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[.1em] text-navy">
              {cat.items.length}{' '}
              {lang === 'af'
                ? cat.items.length === 1
                  ? 'Leerstelling'
                  : 'Leerstellings'
                : cat.items.length === 1
                ? 'Belief'
                : 'Beliefs'}
            </div>
            <h2 className="mb-2.5 font-serif text-3xl font-medium text-ink">{cat.name[lang]}</h2>
            <p className="max-w-[560px] text-[15px] leading-relaxed text-slate-muted">
              {cat.desc[lang]}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {cat.items.map((item, ii) => {
              const counter =
                beliefCategories
                  .slice(0, ci)
                  .reduce((n, c) => n + c.items.length, 0) +
                ii +
                1;
              const id = `belief-${counter}`;
              const isOpen = !!open[id];
              return (
                <div
                  key={id}
                  className={`overflow-hidden rounded-card border border-subtle bg-cream-card ${
                    isOpen ? 'border-l-[3px] border-l-navy' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-panel`}
                    className="flex w-full items-center justify-between gap-4 px-5.5 py-5 text-left"
                  >
                    <span className="flex items-center gap-3.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-navy/10 font-serif text-xs font-bold text-navy">
                        {String(counter).padStart(2, '0')}
                      </span>
                      <span className="font-serif text-[21px] text-ink">{item[lang].title}</span>
                    </span>
                    <span aria-hidden className="flex-none text-2xl font-light text-navy">
                      {isOpen ? '–' : '+'}
                    </span>
                  </button>
                  {/* Always rendered, hidden when collapsed. Rendering it only
                      while open left aria-controls pointing at an id that was
                      not in the document — an aria-valid-attr-value violation
                      on all 28. It also means the text is in the served HTML,
                      so a crawler and a reader without JavaScript get it. C-43 */}
                  <div
                    id={`${id}-panel`}
                    hidden={!isOpen}
                    className="px-5.5 pb-5.5 pl-15 text-[15px] leading-relaxed text-slate"
                  >
                    {item[lang].desc}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function BeliefsPage() {
  return (
    <LanguageProvider>
      <BeliefsContent />
    </LanguageProvider>
  );
}
