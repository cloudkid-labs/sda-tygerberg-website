import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { withBase } from '../../lib/base';
import type { HomePayload } from '../../lib/cms/types';

/**
 * "Geleenthede" — live pages the board has marked "Show under Events" in the
 * CMS, newest publish first (C-70). `data` is the page's payload: empty in
 * the build, filled per request by the Worker, so the first render matches
 * the HTML exactly.
 */
export function EventPages({ data }: { data: HomePayload }) {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  return (
    <section id="geleenthede" className="mx-auto max-w-content scroll-mt-24 px-7 py-16">
      <h2 className="mb-2 font-serif text-[34px] font-medium text-ink">{t.eventsHeading}</h2>
      <p className="mb-8 text-slate">{t.eventsSub}</p>
      {data.eventPages.length === 0 ? (
        <p className="rounded-card border border-dashed border-subtle bg-cream-card p-5 text-[14px] text-slate-muted">{t.eventsEmpty}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
          {data.eventPages.map((p) => (
            <a
              key={p.slug}
              href={withBase(`/${p.slug}/`)}
              className="flex flex-col rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card transition-colors hover:border-orange"
            >
              {p.eyebrow[lang] && <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">{p.eyebrow[lang]}</div>}
              <div className="mb-1.5 font-serif text-xl text-ink">{p.title[lang]}</div>
              {p.intro[lang] && <p className="mb-3 line-clamp-3 text-[13.5px] text-slate">{p.intro[lang]}</p>}
              <div className="mt-auto flex items-center gap-1.5 text-[13px] font-bold text-slate">
                {t.eventsMore}
                <span className="text-orange">→</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
