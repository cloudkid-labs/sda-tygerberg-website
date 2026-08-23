/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** `YYYY-MM-DD`, frozen once per build in astro.config.mjs. See C-44. */
  readonly PUBLIC_BUILD_DATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
