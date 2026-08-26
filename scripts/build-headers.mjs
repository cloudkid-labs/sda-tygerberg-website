#!/usr/bin/env node
/**
 * Fills in the Content-Security-Policy in `dist/_headers`.
 *
 * The policy cannot be written by hand because Astro emits inline scripts — the
 * island loader on every page, and `define:vars` on /map/ — and a script-src
 * without `'unsafe-inline'` only allows those if it names their hash. So the
 * hashes are read out of the built HTML, which is the only place they exist.
 *
 * Runs from `npm run build`, after `astro build`. Exits non-zero on anything
 * unexpected: a build that silently shipped no CSP would look fine and protect
 * nothing.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const HEADERS = join(DIST, '_headers');
const PLACEHOLDER = /^[ \t]*#[ \t]*CSP-PLACEHOLDER.*(?:\r?\n[ \t]*#.*)*$/m;

/** Every `<script>` without a `src`, whatever its type — CSP covers them all,
 *  including `application/ld+json`, which Chrome blocks without a hash. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  console.error('✖ scripts/build-headers.mjs: no HTML in dist/. Did astro build run?');
  process.exit(1);
}

const hashes = new Set();
for (const page of pages) {
  for (const [, body] of readFileSync(page, 'utf8').matchAll(INLINE_SCRIPT)) {
    if (!body.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
}

/*
 * Astro emits at least the island loader inline on every page that hydrates, so
 * finding none means the scan is broken — a regex that stopped matching, or a
 * future Astro that externalises them. Shipping `script-src 'self'` with no
 * hashes would not look wrong here and would kill every island in production.
 */
if (hashes.size === 0) {
  console.error('✖ scripts/build-headers.mjs: no inline scripts found in dist/.');
  console.error('  Either the scan is broken or Astro stopped inlining. Refusing');
  console.error('  to write a hash-less script-src, which would block every island.');
  process.exit(1);
}

const scriptHashes = [...hashes].sort().join(' ');

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Same-origin: the homepage frames /map/, and nothing else may frame us.
  "frame-ancestors 'self'",
  "form-action 'self'",
  // unpkg serves Leaflet on /map/, pinned and hash-checked there too.
  `script-src 'self' https://unpkg.com ${scriptHashes}`,
  // 'unsafe-inline' is unavoidable for styles: React writes style attributes
  // (Hero's aspect-ratio box), and a hash cannot cover an attribute.
  "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Transform URLs are same-origin (/cdn-cgi/image/...); the tiles are not.
  // i.ytimg.com: the preview card's thumbnail. A cookieless CDN, and the one
  // Google host the visitor's browser touches before a deliberate click — the
  // video data itself comes through /api/latest-video (C-60).
  "img-src 'self' data: https://*.tile.openstreetmap.org https://i.ytimg.com",
  // /api/live-status, /api/contact and the transformer probe are all same-origin.
  // www.youtube.com: the card's reachability probe (no-cors fetch of the
  // embed URL). Deliberately the ONLY Google host here: on a looping network
  // the probe's redirect leaves this allowlist, the fetch rejects, and that
  // rejection IS the verdict the card wants (C-60).
  "connect-src 'self' https://www.youtube.com",
  // 'self' is /map/; youtube-nocookie.com is where the embed is served from.
  //
  // google.com was added here and then taken back out. The console said
  // "Framing 'https://www.google.com/' violates ..." so allowing it looked like
  // the fix; what it actually did was un-hide a redirect loop, and the card
  // rendered Chrome's "redirected you too many times" page where the video
  // belongs. Blocked, the same failure is silent. Neither plays the video —
  // that is a problem with the embed itself and needs a browser to diagnose,
  // not a wider policy. Do not re-add google.com without one. C-60
  // Both hosts: the embed is on youtube.com while the nocookie domain is under
  // test (C-60), and keeping the old one listed makes reverting a one-liner.
  // Neither admits google.com — that was tried and loops rather than plays.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  'upgrade-insecure-requests',
].join('; ');

const source = readFileSync(HEADERS, 'utf8');
if (!PLACEHOLDER.test(source)) {
  console.error(`✖ scripts/build-headers.mjs: no CSP placeholder in ${HEADERS}.`);
  console.error('  public/_headers must carry a `# CSP-PLACEHOLDER` line inside the /* block.');
  process.exit(1);
}

writeFileSync(HEADERS, source.replace(PLACEHOLDER, `  Content-Security-Policy: ${CSP}`));
console.log(
  `✔ CSP written to dist/_headers — ${hashes.size} inline script hash(es) across ${pages.length} page(s)`,
);
