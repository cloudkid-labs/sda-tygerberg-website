/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** `YYYY-MM-DD`, frozen once per build in astro.config.mjs. See C-44. */
  readonly PUBLIC_BUILD_DATE: string;
  /** Turnstile site key. Unset means no widget — see C-21. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
