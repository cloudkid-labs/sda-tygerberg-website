#!/usr/bin/env node
/**
 * Generates the pre-resized copy of any headshot that lacks one, and checks
 * that every photo the roster references actually exists.
 *
 * Each headshot lives twice: the full-size original in `public/images/hod/`,
 * which only Cloudflare reads as a transform source, and a ~1400px copy in
 * `fallback/`, which a browser downloads directly when transformations are off
 * (C-02, C-22). cdnImage.ts derives both paths from one filename so they cannot
 * drift — but nothing until now created the second file, so adding a photo
 * meant remembering a resize step that is easy to skip and invisible when
 * skipped, until the CDN is disabled and every card 404s.
 *
 *   node scripts/headshot-fallbacks.mjs
 *
 * Idempotent: existing fallbacks are left alone. Pass --force to rebuild them.
 */

import { readdirSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const HOD = 'public/images/hod';
const FALLBACK = join(HOD, 'fallback');

/** Matches the existing set: 2:3 sources land at exactly 1400x2100. */
const WIDTH = 1400;
/** Same quality the edge uses, so the two copies look alike — cdnImage.ts. */
const QUALITY = 82;

const force = process.argv.includes('--force');

mkdirSync(FALLBACK, { recursive: true });

const sources = readdirSync(HOD).filter((f) => /\.jpe?g$/i.test(f));
if (sources.length === 0) {
  console.error(`No headshots in ${HOD}/`);
  process.exit(1);
}

const warnings = [];
let made = 0;

for (const file of sources) {
  const src = join(HOD, file);
  const dest = join(FALLBACK, file);

  if (existsSync(dest) && !force) continue;

  const { width, height } = await sharp(src).metadata();

  // The card is a 4/5 box filled with object-cover, so a landscape source is
  // cropped hard on both sides — on a couple or a group that usually means
  // faces losing their edges. Resizing cannot decide that; a person must.
  if (width > height) {
    warnings.push(
      `${file} is landscape (${width}x${height}). The card crops to 4/5, so ` +
        `this will lose both sides. Crop it to portrait before publishing.`,
    );
  }
  if (width < WIDTH) {
    warnings.push(`${file} is only ${width}px wide; the fallback wants ${WIDTH}px.`);
  }

  // Width only: height follows the source, exactly as the existing 2:3 set did.
  // Cropping here would bake a framing decision into a file nobody re-checks.
  await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toFile(dest);

  const out = await sharp(dest).metadata();
  const kb = (statSync(dest).size / 1024).toFixed(0);
  console.log(`✔ ${file} → fallback/${file}  ${out.width}x${out.height}  ${kb}KB`);
  made++;
}

console.log(made ? `\nGenerated ${made} fallback${made === 1 ? '' : 's'}.` : 'All fallbacks present.');

// Every referenced photo must exist in both places. A `photo` is what puts a
// person on the page, so a typo here is a broken card rather than a quiet skip.
const roster = readFileSync('src/data/departmentHeads.ts', 'utf8');
const referenced = [...roster.matchAll(/^\s+photo: '([^']+)'/gm)].map((m) => m[1]);
const missing = referenced.flatMap((file) => {
  const gaps = [];
  if (!existsSync(join(HOD, file))) gaps.push(`${HOD}/${file}`);
  if (!existsSync(join(FALLBACK, file))) gaps.push(`${FALLBACK}/${file}`);
  return gaps;
});

if (missing.length > 0) {
  console.error(`\n✖ Referenced by the roster but not on disk:`);
  for (const path of missing) console.error(`  ${path}`);
  process.exit(1);
}
console.log(`✔ All ${referenced.length} referenced photos exist in both sizes.`);

for (const warning of warnings) console.warn(`\n⚠ ${warning}`);
