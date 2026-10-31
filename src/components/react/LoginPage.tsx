import { useEffect, useState } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy } from '../../data/boardCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/** Google's own "G", as their sign-in branding guidelines allow on the button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

/**
 * The one door to the members area: what the account must be, the Google
 * button, and nothing else. A signed-in member is sent straight on to
 * /members/. `?error=forbidden` is kept for old links; /auth/callback now sends
 * a refused account to the 403 page instead.
 */
function LoginContent() {
  const { lang } = useLanguage();
  const t = boardCopy[lang];
  const [forbidden] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('error') === 'forbidden',
  );

  useEffect(() => {
    fetch('/api/mail/session', { headers: { Accept: 'application/json' } })
      .then((res) => {
        if (res.ok) window.location.replace('/members/');
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex flex-1 items-center justify-center px-5 py-16">
        <section className="w-full max-w-[440px] rounded-card-lg border border-subtle border-t-2 border-t-orange bg-cream-card p-7 text-center shadow-card sm:p-9">
          <p className="mb-3.5 text-xs font-bold uppercase tracking-[.16em] text-orange">{t.loginEyebrow}</p>
          <h1 className="mb-2.5 font-serif text-[34px] font-medium leading-[1.1] tracking-[-.015em] text-ink">
            {t.loginHeading}
          </h1>
          <p className="mb-7 text-[15px] leading-relaxed text-slate">{t.loginSub}</p>

          {forbidden && (
            <p
              role="alert"
              className="mb-6 rounded-card border border-subtle bg-white px-4 py-3 text-[14.5px] text-slate"
            >
              {t.errUnauthorised}
            </p>
          )}

          <a
            href="/auth/login"
            className="flex min-h-[50px] items-center justify-center gap-3 rounded-pill border border-strong bg-white text-[15px] font-semibold text-ink transition-colors hover:bg-tan"
          >
            <GoogleMark />
            {t.signIn}
          </a>
          <p className="mt-5.5 text-[13px] leading-relaxed text-slate-muted">{t.signInHint}</p>

          <p className="mt-6 text-[13px] text-slate-muted">
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
