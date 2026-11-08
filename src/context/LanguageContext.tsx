import { ChurchLocaleProvider, useChurchLocale } from '@cloudkid-labs/sda-church-site-core/locale';
import type { ReactNode } from 'react';
import { CHURCH_SITE } from '../data/churchSite';
import type { Lang } from '../data/site';

export function LanguageProvider({ children }: { children: ReactNode }) {
  return <ChurchLocaleProvider site={CHURCH_SITE} storageKey="tygerberg-lang">{children}</ChurchLocaleProvider>;
}

export function useLanguage(): { lang: Lang; setLang: (lang: Lang) => void } {
  const { locale, setLocale } = useChurchLocale();
  return { lang: locale, setLang: setLocale };
}
