import type { APIContext } from 'astro';

/**
 * Hand-written rather than via @astrojs/sitemap — a handful of static routes
 * don't justify another production dependency. Add new pages here by hand;
 * nothing enumerates `src/pages/` for you.
 *
 * Nothing advertises this file: Cloudflare serves a managed robots.txt with no
 * `Sitemap:` directive, so it has to be
 * submitted once in Google Search Console before it does anything — see the
 * README.
 */
const ROUTES = [
  { path: '/', priority: '1.0' },
  { path: '/beliefs/', priority: '0.8' },
  { path: '/connect/', priority: '0.7' },
  { path: '/bible-studies/', priority: '0.7' },
  { path: '/giving/', priority: '0.6' },
  { path: '/blood-bank/', priority: '0.5' },
];

export function GET({ site }: APIContext) {
  // Production origin even on devtest — C-23.
  const origin = site!;

  const urls = ROUTES.map(
    ({ path, priority }) =>
      `  <url>\n    <loc>${new URL(path, origin).href}</loc>\n    <priority>${priority}</priority>\n  </url>`,
  ).join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
