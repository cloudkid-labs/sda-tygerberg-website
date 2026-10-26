import { useState } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy } from '../../data/boardCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/**
 * The one door to the board's mail: what the account must be, the Google
 * button, and nothing else. Reads `?error=forbidden` (set by /auth/callback
 * for a signed-in account that is not on the board list) so a refused login
 * says why instead of looping back silently.
 */
function LoginContent() {
  const { lang } = useLanguage();
  const t = boardCopy[lang];
  const [forbidden] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('error') === 'forbidden',
  );

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex flex-1 items-center justify-center">
        <section className="mx-auto w-full max-w-[560px] px-5 py-14 text-center sm:px-7">
          <h1 className="mb-4 font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] text-ink">
            {t.loginHeading}
          </h1>
          <p className="mx-auto mb-8 max-w-[440px] text-[16.5px] leading-relaxed text-slate">
            {t.loginSub}
          </p>

          {forbidden && (
            <p
              role="alert"
              className="mx-auto mb-6 max-w-[440px] rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate"
            >
              {t.errUnauthorised}
            </p>
          )}

          <a
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-navy px-8 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-ink"
          >
            {t.signIn}
          </a>
          <p className="mx-auto mt-4 max-w-[440px] text-[13.5px] text-slate">{t.signInHint}</p>

          <p className="mt-10 text-[13px] text-slate-muted">
            <a href="/privacy" className="underline">
              {t.privacyLabel}
            </a>{' '}
            ·{' '}
            <a href="/terms" className="underline">
              {t.termsLabel}
            </a>
          </p>
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function LoginPage() {
  return (
    <LanguageProvider>
      <LoginContent />
    </LanguageProvider>
  );
}
