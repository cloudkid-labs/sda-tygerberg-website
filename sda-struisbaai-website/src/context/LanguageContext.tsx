import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from '../data/site';

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'struisbaai-lang';
const DEFAULT_LANG: Lang = 'af';

function isLang(value: unknown): value is Lang {
  return value === 'af' || value === 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always starts at the default so the client's first render matches the
  // statically pre-rendered HTML; the stored choice is applied on mount.
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);

  // Separate documents have separate React roots, so without this the toggle
  // resets on every navigation between them.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLang(stored) && stored !== lang) setLang(stored);
    } catch {
      // Private mode / storage disabled — fall back to the default language.
    }
    // Runs once on mount; `lang` is only read to avoid a redundant setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Outside the try on purpose: this can't throw, and grouping it with
    // localStorage meant blocked storage skipped it too — leaving English
    // content announced with Afrikaans pronunciation.
    document.documentElement.lang = lang;

    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore — persistence is a convenience, not required for the site to work.
    }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
