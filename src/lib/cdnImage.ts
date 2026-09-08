/**
 * Cloudflare Image Transformations: one full-size image on the origin, every
 * size the browser downloads made at the edge from a `/cdn-cgi/image/...` URL.
 * Same shape as the wedding.cloudkid.link gallery.
 *
 * `/cdn-cgi/*` is handled by Cloudflare before a request reaches the Worker,
 * so src/worker/index.ts neither sees nor routes these. Both zones have Image
 * Resizing (sdatygerberg.co.za enabled 2026-09-08), so both builds serve
 * transforms; PUBLIC_IMAGE_CDN=false stays as the escape hatch for a zone
 * without it.
 *
 * CONCERNS.md C-02 through C-10 cover why this is shaped the way it is. Read
 * C-03 before touching HEADSHOT_SIZES and C-10 before adding a width.
 */
import { withBase } from './base';

/** Shared across every URL — a second variant doubles the billing count (C-10). */
export const IMAGE_TRANSFORM_OPTIONS = 'format=auto,quality=82,fit=scale-down';

/** srcset candidates. Largest is the floor for MASTER_WIDTH (C-04). */
export const HEADSHOT_WIDTHS = [320, 480, 640, 960, 1280];

/** The card's rendered width per breakpoint. Mirrors CARD_WIDTH — C-03. */
export const HEADSHOT_SIZES = [
  '(max-width: 639px) calc(72vw - 40px)',
  '(max-width: 1023px) calc(45vw - 25px)',
  '(max-width: 1179px) calc(31vw - 17px)',
  '348px',
].join(', ');

export const HEADSHOT_DIR = '/images/hod';
export const HEADSHOT_FALLBACK_DIR = `${HEADSHOT_DIR}/fallback`;

/** Transform source: full-size, for Cloudflare only — never a browser (C-02). */
export const headshotSource = (file: string) => `${HEADSHOT_DIR}/${file}`;

/** The pre-resized copy, as a URL a browser can use directly. */
export const headshotFallbackUrl = (file: string) => withBase(`${HEADSHOT_FALLBACK_DIR}/${file}`);

/** Build-time "there is no transformer here" — C-22. */
export const IMAGE_CDN_ENABLED = import.meta.env.PUBLIC_IMAGE_CDN !== 'false';

/** No `onerror=redirect`: it would serve the original — C-08. */
export function cdnImageUrl(path: string, width: number): string {
  return `/cdn-cgi/image/${IMAGE_TRANSFORM_OPTIONS},width=${width}${withBase(path)}`;
}

export function cdnSrcset(path: string, widths: number[] = HEADSHOT_WIDTHS): string {
  return widths.map((w) => `${cdnImageUrl(path, w)} ${w}w`).join(', ');
}

export type ImageCdnStatus = 'unknown' | 'available' | 'unavailable';

/** One probe per page load, however many callers ask. */
let inFlight: Promise<boolean> | null = null;

/**
 * Is the transformer answering? `HEAD` against a URL already in the srcset, so
 * it costs no bytes and no extra billable transformation. Checks the status and
 * the content-type, because a 404 page is a successful fetch. CONCERNS.md C-09.
 */
export function probeImageCdn(sampleUrl: string): Promise<boolean> {
  if (!IMAGE_CDN_ENABLED) return Promise.resolve(false);
  inFlight ??= fetch(sampleUrl, { method: 'HEAD' })
    .then((res) => res.ok && (res.headers.get('content-type') ?? '').startsWith('image/'))
    .catch(() => false);
  return inFlight;
}
