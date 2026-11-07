import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { resources } from '../../data/resources';
import { withBase } from '../../lib/base';

export function Resources() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];

  return (
    <section id="hulpbronne" className="mx-auto max-w-content scroll-mt-24 px-7 py-16">
      <h2 className="mb-2 font-serif text-[34px] font-medium text-ink">{t.resourcesHeading}</h2>
      <p className="mb-8 text-slate">{t.resourcesSub}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
        {resources.map((resource) => (
          <a
            key={resource.domain}
            href={resource.url}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-4 rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card hover:border-orange"
          >
            <span className="flex h-11.5 w-11.5 flex-none items-center justify-center rounded-card bg-white ring-1 ring-orange/25">
              <img src={withBase(resource.logo)} alt="" className="h-7 w-7 object-contain" />
            </span>
            <span className="flex-1">
              <div className="font-serif text-base text-ink">{resource.name[lang]}</div>
              <div className="text-xs text-slate-muted">{resource.domain}</div>
            </span>
            <span className="flex-none text-lg text-orange">→</span>
          </a>
        ))}
      </div>
    </section>
  );
}
