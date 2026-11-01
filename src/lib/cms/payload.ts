import { homePayload } from './public';
import { seedEvents, seedHeads } from './seed';
import type { HomePayload } from './types';

export { HOME_PAYLOAD_ID, PAGE_PAYLOAD_ID } from './ids';

/**
 * Reads a payload the page carries. Null on the server (the build) and when
 * the element is missing or unreadable — callers then fall back to the seed,
 * which is exactly what the build rendered.
 */
export function readJsonScript<T>(id: string): T | null {
  if (typeof document === 'undefined') return null;
  const text = document.getElementById(id)?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * The homepage as the build renders it: the seed, as at the build date. The
 * Worker replaces the page's copy of this per request with live content
 * (src/worker/cmsPublic.ts); without a Worker the two are the same object.
 */
export function buildHomePayload(): HomePayload {
  return homePayload(seedEvents(), seedHeads(), import.meta.env.PUBLIC_BUILD_DATE, {
    imageCdn: import.meta.env.PUBLIC_IMAGE_CDN !== 'false',
  });
}
