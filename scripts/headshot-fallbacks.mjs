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
 *   npm run headshots            # generate anything missing
 *   npm run headshots -- --force # rebuild every fallback
 *   npm run headshots -- --check # report gaps, write nothing, exit non-zero
 *
 * CI runs `--check`. Without it the step would generate the fallback someone
 * forgot to commit, find nothing missing, and pass — the one outcome that makes
 * the check pointless.
 *
 * Idempotent: existing fallbacks are left alone unless --force. The checks run
 * either way — they used to sit below the skip, so the only files ever
 * validated were the ones being created in that same run.
 *
 * This is the only generator. `tools/build-headshots.mjs` was a second one
 * writing the same files from the same sources with different settings, and
 * `npm run headshots` pointed at the one that had them wrong. C-52
 *
 * `sharp` is not a direct dependency — it arrives with Astro's. See tools/README.
 */

import { readdirSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('✖ sharp is not installed. It normally arrives with Astro — run `npm ci`.');
  process.exit(1);
}

const HOD = 'public/images/hod';
const FALLBACK = join(HOD, 'fallback');

/** Must stay >= the largest HEADSHOT_WIDTHS entry — C-04. Matches the existing
 *  set: 2:3 sources land at exactly 1400x2100. */
const WIDTH = 1400;

/**
 * Higher than the transform's 82, deliberately — C-07 measured it: SSIM 0.9733
 * at 82 against 0.9812 at 90, and this copy is what a visitor gets when there
 * is no transformer to do better. Reading `quality=82` off cdnImage.ts and
 * matching it here is the mistake C-07 exists to prevent.
 */
const QUALITY = 90;

const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
if (force && check) {
  console.error('✖ --force and --check are opposites. Pick one.');
  process.exit(1);
}

mkdirSync(FALLBACK, { recursive: true });

const sources = readdirSync(HOD).filter((f) => /\.jpe?g$/i.test(f));
if (sources.length === 0) {
  console.error(`No headshots in ${HOD}/`);
  process.exit(1);
}

const warnings = [];
let made = 0;
let checked = 0;

for (const file of sources.sort()) {
  const src = join(HOD, file);
  const dest = join(FALLBACK, file);

  const meta = await sharp(src).metadata();
  // `.rotate()` below applies EXIF orientation, which swaps the axes for
  // orientations 5-8. Judge the shape the way the output will look.
  const sideways = meta.orientation >= 5 && meta.orientation <= 8;
  const width = sideways ? meta.height : meta.width;
  const height = sideways ? meta.width : meta.height;
  checked++;

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

  if (!existsSync(dest) && check) {
    warnings.push(`fallback/${file} is missing. Run \`npm run headshots\` and commit it.`);
    continue;
  }

  if (existsSync(dest) && !force) {
    // Validate what is already there rather than trusting it. A fallback built
    // by the old second generator, or by hand, can be the wrong size.
    const have = await sharp(dest).metadata();
    const want = Math.min(WIDTH, width);
    if (have.width !== want) {
      warnings.push(
        `fallback/${file} is ${have.width}px wide, expected ${want}px. ` +
          `Rebuild it with --force.`,
      );
    }
    continue;
  }

  /*
   * `.rotate()` applies EXIF orientation before the resize, and sharp then
   * drops EXIF and the ICC profile — a size win that also strips the camera and
   * location metadata. Safe: the originals are already sRGB IEC61966-2.1.
   *
   * Without it a photo straight off a camera at orientation 6 writes a sideways
   * fallback, while Cloudflare's transform honours the EXIF and renders it
   * upright — so the card is correct in production and rotated 90° everywhere
   * there is no transformer, and nothing anywhere reports it.
   */
  await sharp(src)
    .rotate()
    .resize({ width: WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
    .toFile(dest);

  const out = await sharp(dest).metadata();
  const kb = (statSync(dest).size / 1024).toFixed(0);
  console.log(`✔ ${file} → fallback/${file}  ${out.width}x${out.height}  ${kb}KB`);
  made++;
}

console.log(
  made
    ? `\nGenerated ${made} fallback${made === 1 ? '' : 's'}; checked ${checked}.`
    : check && warnings.length
      ? `\nChecked ${checked}; ${warnings.length} need attention.`
      : `All fallbacks present; checked ${checked}.`,
);

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

for (const warning of warnings) console.warn(`\n⚠ ${warning}`);

// Under --check a warning is the finding, not a footnote: nothing was written,
// so there is no other signal that the tree is short a file.
if (check && warnings.length > 0) {
  console.error(`\n✖ ${warnings.length} problem(s) with the committed fallbacks.`);
  process.exit(1);
}

if (missing.length > 0) {
  console.error(`\n✖ Referenced by the roster but not on disk:`);
  for (const path of missing) console.error(`  ${path}`);
  process.exit(1);
}
console.log(`✔ All ${referenced.length} referenced photos exist in both sizes.`);
