import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/*
 * Frozen once per build and read as `import.meta.env.PUBLIC_BUILD_DATE`, so the
 * static HTML and the hydrating bundle see the same date and cannot disagree.
 * Reading the clock at module scope instead would give the browser a different
 * answer from the build and break the hydration contract C-36 protects.
 *
 * A `PUBLIC_` env var rather than `vite.define`: Vite only applies user defines
 * to the *server* consumer under `astro dev`, so a client island would hydrate
 * against an undeclared identifier and throw. `PUBLIC_` is inlined for both.
 * C-44
 */
process.env.PUBLIC_BUILD_DATE ??= new Date().toISOString().slice(0, 10);

// ASTRO_BASE serves the build under a subpath; left unset both deploys serve
// from the domain root (production and devtest are Cloudflare Workers on their
// own custom domains — C-61).
export default defineConfig({
  // The devtest origin for canonical tags and social metadata. Replace this
  // with Struisbaai's confirmed production origin before enabling production.
  site: 'https://struisbaai-sda.cloudkid.link',
  base: process.env.ASTRO_BASE || '/',
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
