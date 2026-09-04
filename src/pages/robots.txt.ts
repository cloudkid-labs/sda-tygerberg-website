import type { APIContext } from 'astro';

/**
 * Per-environment robots.txt, decided at build time by the same flag that
 * drives the noindex meta (PUBLIC_INDEXABLE, set to 'false' only on the
 * devtest build).
 *
 * The preview must stay publicly accessible but never compete with production
 * in search, without a login wall (PR #100's Access gate was evaluated and
 * rejected — C-62). So dev answers `Disallow: /` with no sitemap line, while
 * production allows crawling and advertises the sitemap. The noindex meta and
 * the production canonicals (C-23) stay as the primary mechanism — a
 * `Disallow` is a crawl directive, not an index directive, so it is the
 * secondary "don't waste crawl budget" signal, not the guarantee.
 *
 * Pure helper below so the contract is unit-tested; the GET wrapper only
 * reads the flag. C-23
 */
export function robotsTxt(indexable: boolean, sitemapUrl: string): string {
  if (!indexable) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

export function GET({ site }: APIContext) {
  // Production origin even on devtest — C-23. Only used for the prod branch;
  // the dev branch names no host at all.
  const indexable = import.meta.env.PUBLIC_INDEXABLE !== 'false';
  const sitemapUrl = new URL('/sitemap.xml', site!).href;
  return new Response(robotsTxt(indexable, sitemapUrl), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
