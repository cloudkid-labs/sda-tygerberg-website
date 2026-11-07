/**
 * Prefixes a root-relative path with Astro's configured base (ASTRO_BASE, for
 * subpath deployments like GitHub Pages). Needed wherever a path is hardcoded
 * in a React component rather than resolved by Astro's routing.
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * The inverse of `withBase`: strips the base back off a pathname, so canonicals
 * and the sitemap name production URLs even from the preview. CONCERNS.md C-23.
 */
export function canonicalPath(pathname: string): string {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  if (!normalizedBase) return pathname;
  if (pathname === normalizedBase) return '/';
  return pathname.startsWith(`${normalizedBase}/`)
    ? pathname.slice(normalizedBase.length)
    : pathname;
}
