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
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  // /api/live-status, /api/contact and the transformer probe are all same-origin.
  "connect-src 'self'",
  "frame-src 'self' https://www.youtube-nocookie.com",
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
