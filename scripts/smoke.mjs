#!/usr/bin/env node
/**
 * Post-deploy liveness check. Runs against the origin that was just deployed
 * and fails the workflow when the site is serving something it should not be.
 *
 * This exists because of C-60. `run_worker_first` was narrowed to a pattern
 * list that left `/api/*` out, and every API route started answering with
 * 404.html. Typecheck passed, 26 tests passed, the build passed, the deploy
 * reported success, and the contact form was broken in production for an hour
 * until someone opened the console. Nothing in the pipeline looked at the
 * running site, so nothing could have caught it.
 *
 * The rule for what belongs here: it must be checkable only against a live
 * deployment. Anything a unit test or the build can prove belongs there
 * instead — this file costs deploy time and a false failure blocks a release.
 *
 * Usage: node scripts/smoke.mjs <base-url> [--no-edge]
 *   --no-edge  the target has no Cloudflare edge in front of it. That removes
 *              two things at once, and conflating them is how the first version
 *              of this script red-failed a healthy devtest deploy: there is no
 *              Worker, so /api/* is absent by design (PUBLIC_HAS_API=false),
 *              AND `public/_headers` is a Cloudflare mechanism that GitHub
 *              Pages never interprets — it uploads as a plain file and answers
 *              200, while the response carries no CSP and no security headers
 *              at all. Checking for either against Pages tests nothing about
 *              the build and only produces noise.
 */

const base = process.argv[2]?.replace(/\/$/, '');
const noEdge = process.argv.includes('--no-edge');

if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url> [--no-edge]');
  process.exit(2);
}

const failures = [];
const notes = [];

function fail(what, detail) {
  failures.push(`${what} — ${detail}`);
  console.log(`  ✖ ${what}\n      ${detail}`);
}
function pass(what, detail = '') {
  console.log(`  ✔ ${what}${detail ? `  (${detail})` : ''}`);
}

/** One fetch with a couple of retries: a cold Worker or a propagating deploy
 *  is not a broken site, and a flaky smoke test is worse than none. */
async function get(path, init = {}) {
  const url = `${base}${path}`;
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', ...init });
      if (res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw last ?? new Error('unreachable');
}

console.log(`\nSmoke-testing ${base}\n`);

/* ---- every page renders ------------------------------------------------ */
console.log('pages');
const PAGES = ['/', '/beliefs/', '/bible-studies/', '/blood-bank/', '/connect/', '/giving/', '/map/', '/youth/'];
for (const path of PAGES) {
  try {
    const res = await get(path);
    const body = await res.text();
    if (!res.ok) fail(`page ${path}`, `HTTP ${res.status}`);
    else if (body.length < 1000) fail(`page ${path}`, `only ${body.length} bytes — suspiciously empty`);
    else if (/Bladsy nie gevind|Page not found/i.test(body)) fail(`page ${path}`, 'served the 404 page');
    else pass(`page ${path}`, `${res.status}, ${body.length}b`);
  } catch (err) {
    fail(`page ${path}`, err.message);
  }
}

/* ---- the API routes exist ---------------------------------------------- */
console.log('\napi');
if (noEdge) {
  notes.push('API checks skipped (--no-edge): this deployment has no Worker.');
  console.log('  – skipped, no Worker on this target');
} else {
  try {
    const res = await get('/api/live-status');
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      // The exact C-60 shape: the Worker is not being invoked, so asset
      // serving answers with 404.html.
      fail('/api/live-status', `HTTP ${res.status}${/html/i.test(type) ? ' and served HTML — the Worker is not being invoked for /api/*, check assets.run_worker_first in wrangler.jsonc (C-60)' : ''}`);
    } else if (!/application\/json/i.test(type)) {
      fail('/api/live-status', `expected JSON, got ${type || 'no content-type'}`);
    } else {
      const body = await res.json();
      // `isLive`, not `live` — see the shape src/worker/index.ts returns.
      if (typeof body.isLive !== 'boolean') fail('/api/live-status', `no boolean "isLive" in ${JSON.stringify(body).slice(0, 140)}`);
      else pass('/api/live-status', `JSON, isLive=${body.isLive}, source=${body.source}`);
    }
  } catch (err) {
    fail('/api/live-status', err.message);
  }

  // GET on a POST-only route must still reach the Worker. A 404 here means the
  // same routing failure; the Worker's own rejection is a 4xx that is not 404.
  try {
    const res = await get('/api/contact');
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 404 && /html/i.test(type)) {
      fail('/api/contact', 'HTTP 404 HTML — the Worker is not being invoked for /api/* (C-60)');
    } else {
      pass('/api/contact', `reaches the Worker, HTTP ${res.status}`);
    }
  } catch (err) {
    fail('/api/contact', err.message);
  }
}

/* ---- the headshot guard ------------------------------------------------ */
console.log('\nheadshots');
try {
  const home = await (await get('/')).text();
  /*
   * Two shapes, because the markup depends on PUBLIC_IMAGE_CDN. With the
   * transformer on (production) the cards point at
   * `/cdn-cgi/image/<opts>/images/hod/NAME.jpg`; with it off (devtest) they
   * point straight at `/images/hod/fallback/NAME.jpg`. Matching only the
   * second is how the first draft of this check skipped silently against
   * production while reporting a pass.
   */
  const m =
    home.match(/\/images\/hod\/fallback\/([^"' ]+\.jpe?g)/i) ??
    home.match(/\/images\/hod\/([^"'/ ]+\.jpe?g)/i);
  if (!m) {
    fail('headshot markup', 'no headshot URL on the homepage in either the transform or the fallback shape — the cards are not rendering');
  } else {
    const fb = await get(`/images/hod/fallback/${m[1]}`);
    if (!fb.ok) fail('headshot fallback', `HTTP ${fb.status}`);
    else pass('headshot fallback', `${fb.headers.get('content-length') ?? '?'}b`);

    if (!noEdge) {
      // C-51: the plain master URL must answer with the fallback, not the
      // 21-megapixel original. Compared by size, which is the only signal a
      // plain GET gives.
      const plain = await get(`/images/hod/${m[1]}`);
      const plainLen = Number(plain.headers.get('content-length') ?? 0);
      const fbLen = Number(fb.headers.get('content-length') ?? 0);
      if (!plain.ok) fail('headshot master guard', `plain URL returned HTTP ${plain.status}`);
      else if (fbLen && plainLen > fbLen * 1.5) fail('headshot master guard', `plain URL served ${plainLen}b against the fallback's ${fbLen}b — the master is exposed (C-51)`);
      else pass('headshot master guard', `plain URL serves ${plainLen}b, the fallback`);
    }
  }
} catch (err) {
  fail('headshot checks', err.message);
}

/* ---- security headers and the CSP -------------------------------------- */
console.log('\nheaders');
if (noEdge) {
  notes.push('Header and CSP checks skipped (--no-edge): `_headers` is a Cloudflare mechanism and Pages does not apply it.');
  console.log('  – skipped, no Cloudflare edge on this target');
} else try {
  const res = await get('/');
  const required = [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
  ];
  for (const h of required) {
    const v = res.headers.get(h);
    if (!v) fail(`header ${h}`, 'absent');
    else pass(`header ${h}`, v.slice(0, 48));
  }

  const csp = res.headers.get('content-security-policy') ?? '';
  if (csp && !/sha256-/.test(csp)) fail('CSP inline hashes', 'no sha256- hash in the policy — the build wrote a policy that blocks its own inline scripts');

  // Every origin the page frames must be in frame-src. This is the check that
  // would have caught the google.com block in C-60 — but only for frames named
  // in the markup; the YouTube player builds its own at runtime, which is why
  // the browser pass below exists as well.
  const home = await (await get('/')).text();
  const frameSrc = (csp.match(/frame-src ([^;]+)/) ?? [])[1] ?? '';
  for (const [, src] of home.matchAll(/<iframe[^>]+src="(https:\/\/[^"]+)"/gi)) {
    const origin = new URL(src).origin;
    if (!frameSrc.includes(origin)) fail('frame-src', `page frames ${origin}, which frame-src does not allow`);
    else pass('frame-src', `allows ${origin}`);
  }
} catch (err) {
  fail('header checks', err.message);
}

/* ---- verdict ------------------------------------------------------------ */
console.log('');
for (const n of notes) console.log(`note: ${n}`);

if (failures.length) {
  console.log(`\n✖ ${failures.length} smoke check(s) failed against ${base}:`);
  for (const f of failures) console.log(`   - ${f}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error::Smoke test failed against ${base}: ${failures[0]}`);
  }
  process.exit(1);
}

console.log(`\n✔ all smoke checks passed against ${base}`);
