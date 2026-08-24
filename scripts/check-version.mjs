#!/usr/bin/env node
/**
 * Guards the one rule the release machinery cannot enforce on its own: a
 * promotion to `main` must carry a version nobody has released before.
 *
 * The deploy workflow tags only when `package.json`'s version has no release
 * yet, and deploys regardless. That is deliberate — a re-deploy must not tag
 * twice — but it means forgetting to bump ships production silently, untagged,
 * with `app-version` claiming a number that belongs to different code. That has
 * happened twice: once as "Release 11", once at v0.2.0.
 *
 * Run by CI on every pull request into `main`, and available locally as
 * `npm run version:check`.
 *
 * Exits 0 when the version is releasable, 1 with an explanation when it is not.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Strict semver, per https://semver.org §9-10. Build metadata is not accepted:
 *  it is ignored for precedence, so two deploys could differ only by a part the
 *  ordering rules throw away. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

function parse(version) {
  const m = SEMVER.exec(version);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  };
}

/** Precedence per https://semver.org §11. Returns <0, 0 or >0. */
function compare(a, b) {
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] - b[part];
  }

  // "a pre-release version has lower precedence than the normal version"
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    // "a larger set of fields has a higher precedence" when all preceding equal
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;

    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    // "numeric identifiers always have lower precedence than alphanumeric"
    if (xNum && yNum) return Number(x) - Number(y);
    if (xNum) return -1;
    if (yNum) return 1;
    return x < y ? -1 : 1;
  }

  return 0;
}

function fail(lines) {
  console.error(`\n✖ ${lines[0]}\n`);
  for (const line of lines.slice(1)) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const current = parse(version);

if (!current) {
  fail([
    `"${version}" in package.json is not a valid semver version.`,
    'Expected MAJOR.MINOR.PATCH, optionally -prerelease. See https://semver.org',
  ]);
}

// Tags, not GitHub Releases: this has to work locally too, and the two are kept
// in step by the deploy workflow that creates both.
let tags = [];
try {
  tags = execSync('git tag -l "v*"', { encoding: 'utf8' })
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
} catch {
  fail(['Could not read git tags.', 'Is this a git work tree?']);
}

const released = tags
  .map((tag) => ({ tag, parsed: parse(tag.slice(1)) }))
  .filter((entry) => entry.parsed);

/*
 * `git tag -l` on a shallow clone succeeds with empty output — it does not
 * throw — so the catch above could never fire for the case its message named.
 * A checkout without tags therefore reported "first release" and exited 0,
 * waving through a version that is already released: exactly the silent
 * promotion this script exists to stop. Ask git directly instead. C-45
 */
if (released.length === 0) {
  let shallow = false;
  try {
    shallow =
      execSync('git rev-parse --is-shallow-repository', { encoding: 'utf8' }).trim() === 'true';
  } catch {
    // Not a work tree; the tag read above would already have failed.
  }

  if (shallow) {
    fail([
      'No release tags found, and this is a shallow clone.',
      'A shallow checkout carries no tags, so every version would look unreleased.',
      '',
      'Fetch the full history:  actions/checkout with `fetch-depth: 0`',
    ]);
  }

  console.warn(
    `\n! No v* tags in this clone. Treating v${version} as the first release.\n` +
      '  If that is wrong, the tags did not come with the checkout.\n',
  );
}

if (released.some((entry) => entry.tag === `v${version}`)) {
  fail([
    `v${version} is already released.`,
    'Production would deploy this commit without tagging it, leaving',
    `app-version reporting ${version} for code that v${version} does not contain.`,
    '',
    'Bump it:  npm run version:patch   (or :minor / :major)',
  ]);
}

const highest = released.sort((a, b) => compare(a.parsed, b.parsed)).at(-1);

if (highest && compare(current, highest.parsed) < 0) {
  fail([
    `Version ${version} is lower than the latest release ${highest.tag}.`,
    'Releases only move forwards; a lower number cannot be tagged.',
    '',
    'Bump it:  npm run version:patch   (or :minor / :major)',
  ]);
}

console.log(
  `✔ v${version} is releasable` +
    (highest ? ` (latest released: ${highest.tag})` : ' (first release)'),
);
