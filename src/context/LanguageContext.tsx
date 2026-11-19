import { ChurchLocaleProvider, useChurchLocale } from '@cloudkid-labs/sda-church-site-core/locale';
import type { ReactNode } from 'react';
import { CHURCH_SITE } from '../data/churchSite';
import type { Lang } from '../data/site';

// English-first variant for pages whose audience arrives cold (QR stickers) —
// currently only /personal-ministry. A stored visitor choice still wins, so
// this only decides the first paint and the SSR HTML, never overrides anyone.
const EN_SITE = { ...CHURCH_SITE, defaultLocale: 'en' as const };

export function LanguageProvider({
  children,
  defaultLocale = 'af',
}: {
  children: ReactNode;
  defaultLocale?: Lang;
}) {
  const site = defaultLocale === 'en' ? EN_SITE : CHURCH_SITE;
  return <ChurchLocaleProvider site={site} storageKey="tygerberg-lang">{children}</ChurchLocaleProvider>;
}

export function useLanguage(): { lang: Lang; setLang: (lang: Lang) => void } {
  const { locale, setLocale } = useChurchLocale();
  return { lang: locale, setLang: setLocale };
}
