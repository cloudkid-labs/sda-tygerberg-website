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

// Set ASTRO_BASE (e.g. "/sda-tygerberg-website") when building for a GitHub
// Pages project site; leave unset for the Cloudflare production deploy,
// which serves from the domain root.
export default defineConfig({
  // The origin every absolute URL is built from — canonical tags, Open Graph
  // URLs and the sitemap. This is the domain the Worker actually serves (see
  // `routes` in wrangler.jsonc); change it here and nowhere else if the church
  // moves to its own domain.
  site: 'https://tygerberg-sda.cloudkid.link',
  base: process.env.ASTRO_BASE || '/',
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
