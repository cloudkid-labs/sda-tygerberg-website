import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import type { Lang } from '../../data/site';
import { privacyCopy, termsCopy, type LegalCopy } from '../../data/legalCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

type LegalKind = 'privacy' | 'terms';

/**
 * One document page for the Privacy Policy and Terms & Conditions.
 * Section heads in the body face, a step smaller, sentence case — no eyebrow,
 * no tracked caps (gates 54, 67). The document itself is the content: one
 * section per heading, plain prose after it.
 */
function LegalContent({ kind }: { kind: LegalKind }) {
  const { lang } = useLanguage();
  const copy: Record<Lang, LegalCopy> = kind === 'privacy' ? privacyCopy : termsCopy;
  const t = copy[lang];
  const order: string[] =
    kind === 'privacy'
      ? ['what', 'how', 'share', 'cookies', 'rights', 'contact']
      : ['use', 'mail', 'conduct', 'liability', 'changes', 'contact'];

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[720px] px-5 pb-10 pt-14 sm:px-7 sm:pt-16">
          <h1 className="mb-4 font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] text-ink">
            {t.heading}
          </h1>
          <p className="max-w-[560px] text-[16.5px] leading-relaxed text-slate">{t.intro}</p>
        </section>

        <section className="mx-auto max-w-[720px] px-5 pb-16 sm:px-7">
          {order.map((key) => (
            <div key={key} className="mb-8">
              <h2 id={key} className="mb-2 font-serif text-xl font-medium text-ink">
                {t.section(lang, key)}
              </h2>
              <p className="max-w-[600px] text-[15px] leading-relaxed text-slate">
                {t.body(lang, key)}
              </p>
            </div>
          ))}
          <p className="mt-6 text-[13.5px] text-slate-muted">
            {t.lastUpdated}
          </p>
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <LanguageProvider>
      <LegalContent kind={kind} />
    </LanguageProvider>
  );
}
