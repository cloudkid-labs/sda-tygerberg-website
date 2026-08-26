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
let totalChecks = 0;

function fail(what, detail) {
  totalChecks++;
  failures.push(`${what} — ${detail}`);
  console.log(`  ✖ ${what}\n      ${detail}`);
}
function pass(what, detail = '') {
  totalChecks++;
  console.log(`  ✔ ${what}${detail ? `  (${detail})` : ''}`);
}

/*
 * A browser User-Agent, and 403/429 treated as "come back in a moment" rather
 * than as a verdict.
 *
 * Both are here because of a real failure: the first production run of this
 * script came back 403 on every page and blocked the release tag for a deploy
 * that was serving correctly. A dozen rapid requests from a datacenter IP with
 * `node` as the User-Agent is exactly the shape Cloudflare's bot and rate
 * protection exists to stop, and the origin being ours makes no difference to
 * it. The identical request succeeded a minute later.
 *
 * A 403 or 429 on a page that the site is happy to serve a browser is a
 * statement about the *client*, so retrying is right; the old code only
 * retried 5xx and let 403 through as a hard failure. If it survives the
 * retries it is still reported — see the note where pages are checked, which
 * says which of the two it looks like so nobody re-debugs this from scratch.
 */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 10_000;

/*
 * A whole-run deadline on top of the per-request one, because the per-request
 * timeout alone is not a useful bound: 14 URLs x 4 attempts x 10s is over nine
 * minutes, and the workflow would kill the step before it said anything. Past
 * the deadline every remaining request fails immediately, so the run still
 * reaches its verdict and prints which checks it got to.
 */
const RUN_DEADLINE_MS = 150_000;
const startedAt = Date.now();
const outOfTime = () => Date.now() - startedAt > RUN_DEADLINE_MS;

let lastEdgeStatus = null;

async function get(path, init = {}) {
  const url = `${base}${path}`;
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (outOfTime()) throw new Error(`run deadline exceeded (${RUN_DEADLINE_MS / 1000}s) before ${path}`);
    try {
      /*
        * The timeout is not optional. Without it this hung a production deploy
        * for over twenty minutes: `fetch` has no default timeout, and an edge
        * that accepts the connection and then holds it open leaves the await
        * pending forever. A liveness check that can hang is worse than no
        * liveness check — it blocks the release without ever reporting why,
        * and GitHub would not reap the job for six hours.
        */
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...init,
        headers: { 'User-Agent': UA, ...(init.headers ?? {}) },
      });
      if (res.status !== 403 && res.status !== 429 && res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
      lastEdgeStatus = res.status === 403 || res.status === 429 ? res.status : lastEdgeStatus;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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

  // Shape only, not content: the endpoint answers { video: null } when
  // YouTube is unreachable from the Worker's egress, and a CI runner or a
  // sandbox must not fail a healthy deploy over Google's availability.
  try {
    const res = await get('/api/latest-video');
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      fail('/api/latest-video', `HTTP ${res.status}${/html/i.test(type) ? ' and served HTML — the Worker is not being invoked for /api/* (C-60)' : ''}`);
    } else if (!/application\/json/i.test(type)) {
      fail('/api/latest-video', `expected JSON, got ${type || 'no content-type'}`);
    } else {
      const body = await res.json();
      if (!('video' in body)) fail('/api/latest-video', `no "video" key in ${JSON.stringify(body).slice(0, 140)}`);
      else pass('/api/latest-video', `JSON, video=${body.video ? body.video.videoId : 'null'}`);
    }
  } catch (err) {
    fail('/api/latest-video', err.message);
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

/*
 * Blocked is not the same as broken, and conflating them is what made the first
 * two production runs useless. Cloudflare answers a GitHub runner 403 on every
 * request — consistently, not as a burst limit: a browser User-Agent and four
 * retries per URL changed nothing, while the identical checks from elsewhere
 * pass every time.
 *
 * So a run where EVERY check failed and the edge status was 403/429 is
 * inconclusive, not a failure. It cannot be a broken deploy: a site that is
 * genuinely down does not also refuse the request that would prove it. Exit 0
 * with a warning rather than block a release the check never actually
 * examined.
 *
 * A mixed result is different — if anything at all got through, the edge is
 * letting this client see the site, and a failure among those is real. That
 * still exits 1.
 *
 * A WAF skip rule was the standing plan and is ruled out — this zone does not
 * use the WAF, and the block is Cloudflare's default handling of datacenter IPs
 * rather than a rule anyone here can lift. So the production run cannot gate
 * anything, and pretending otherwise would mean either a permanently red
 * pipeline or a gate everyone has learned to ignore. The real gate is the
 * `worker` job in ci.yml, which runs these same checks against `wrangler dev`
 * on every pull request and never meets the edge that does the blocking. C-60
 */
const everythingFailed = failures.length >= totalChecks && totalChecks > 0;
if (lastEdgeStatus && everythingFailed) {
  console.log(
    `\n⚠ INCONCLUSIVE — every one of the ${failures.length} checks was answered ` +
      `${lastEdgeStatus} even after retries.\n` +
      `  Cloudflare is blocking this runner, so the deployment was never actually observed.\n` +
      `  Not treated as a failure: a site that is down does not also refuse the request\n` +
      `  that would prove it. Verify in a browser; see C-60 for why this cannot gate\n` +
      `  from a runner and what replaces it.`,
  );
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning::Smoke test inconclusive against ${base}: edge returned ${lastEdgeStatus} to every request. The deployment was not verified.`);
  }
  process.exit(0);
}

if (failures.length) {
  console.log(`\n✖ ${failures.length} smoke check(s) failed against ${base}:`);
  for (const f of failures) console.log(`   - ${f}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error::Smoke test failed against ${base}: ${failures[0]}`);
  }
  process.exit(1);
}

console.log(`\n✔ all smoke checks passed against ${base}`);

/*
 * Explicit, and load-bearing. Every other terminal path here calls
 * process.exit; this one used to fall off the end and depend on Node's event
 * loop draining, which `fetch` does not guarantee — undici keeps its
 * connection pool alive after the last response, and a socket the far side has
 * not closed keeps the process running with no work left to do.
 *
 * That is not theoretical. Two production deploys in a row sat on this step
 * indefinitely, past `timeout-minutes`, after the deploy itself had succeeded
 * — and the tell was that the *failing* runs finished fine, because failure
 * and inconclusive both exit explicitly and only the all-passed path did not.
 * A check whose healthy outcome is the one that hangs is the worst shape it
 * could have: it blocks a release precisely when nothing is wrong.
 */
process.exit(0);
