import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy } from '../../data/boardCopy';
import { membersCopy } from '../../data/membersCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/** The 403 answer for /members: says why, and who can fix it. */
function NoAccessContent() {
  const { lang } = useLanguage();
  const t = membersCopy[lang];
  const b = boardCopy[lang];
  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={b.backHome} />
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-[440px] rounded-card-lg border border-subtle border-t-2 border-t-orange bg-cream-card p-9 text-center shadow-card">
          <p className="mb-3.5 text-xs font-bold uppercase tracking-[.16em] text-orange">{t.noAccessEyebrow}</p>
          <h1 className="mb-2.5 font-serif text-[34px] font-medium tracking-[-.015em]">{t.noAccessHeading}</h1>
          <p className="mb-7 text-[15px] leading-relaxed text-slate">{t.noAccessBody}</p>
          <a
            href="/auth/login"
            className="inline-flex min-h-[50px] w-full items-center justify-center rounded-pill border border-strong bg-white text-[15px] font-semibold text-ink hover:bg-tan"
          >
            {t.noAccessOtherAccount}
          </a>
        </div>
      </main>
      <SubPageFooter backHome={b.backHome} />
    </div>
  );
}

export function NoAccessPage() {
  return (
    <LanguageProvider>
      <NoAccessContent />
    </LanguageProvider>
  );
}
