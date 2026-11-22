import { NewsletterSignup } from '@cloudkid-labs/sda-church-site-core';
import { useLanguage } from '../../context/LanguageContext';
import { CHURCH_SITE } from '../../data/churchSite';

/** Thin site adapter; copy and endpoint configuration live in CHURCH_SITE. */
export function Newsletter() {
  const { lang } = useLanguage();
  return <NewsletterSignup site={CHURCH_SITE} locale={lang} />;
}
