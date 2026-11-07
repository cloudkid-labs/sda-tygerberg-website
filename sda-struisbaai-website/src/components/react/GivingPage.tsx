import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { withBase } from '../../lib/base';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

function GivingContent() {
  const { lang } = useLanguage();
  const copy = lang === 'af'
    ? {
        backHome: 'Terug tuis',
        eyebrow: 'Skenkings',
        heading: 'Skenkingsbesonderhede tydelik nie beskikbaar nie',
        message: 'Kontak die gemeente via die Verbind-bladsy vir meer inligting.',
        contact: 'Verbind met ons',
      }
    : {
        backHome: 'Back home',
        eyebrow: 'Giving',
        heading: 'Giving details temporarily unavailable',
        message: 'Contact the church through the Connect page for more information.',
        contact: 'Contact us',
      };

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={copy.backHome} />
      <main id="main" className="mx-auto flex w-full max-w-[780px] flex-1 flex-col items-center px-7 py-16 text-center">
        <div className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-orange">{copy.eyebrow}</div>
        <h1 className="mb-4 text-balance font-serif text-[clamp(30px,5vw,44px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
          {copy.heading}
        </h1>
        <div className="mb-5 h-[3px] w-14 rounded bg-blue-muted" />
        <p className="mb-6 max-w-[600px] text-[16.5px] leading-relaxed text-slate">{copy.message}</p>
        <a
          href={withBase('/connect/')}
          className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-orange px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-orange-hover"
        >
          {copy.contact} →
        </a>
      </main>
      <SubPageFooter backHome={copy.backHome} />
    </div>
  );
}

export function GivingPage() {
  return (
    <LanguageProvider>
      <GivingContent />
    </LanguageProvider>
  );
}
