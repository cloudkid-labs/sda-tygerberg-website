#!/usr/bin/env node
/**
 * The Worker re-renders parts of built pages with live CMS content (C-70):
 * #week, #geleenthede and #oor on the homepage, and the root of /page-shell/. Hydration only
 * stays clean if the Worker's render of a payload is byte-for-byte what Astro
 * rendered inside the island for the same payload.
 *
 * This renders the build's own payloads through the Worker's renderers and
 * compares against dist/. A difference means a component reads something the
 * Worker cannot see — a build flag, the clock, `useId` — and the homepage
 * would hydrate against the wrong markup.
 *
 *   node --import ./test/register.mjs scripts/check-cms-render.mjs
 *
 * Runs in CI after `npm run build`.
 */
import { readFileSync } from 'node:fs';
import { renderAboutSection, renderEventsSection, renderPageRoot, renderWeekSection } from '../src/worker/cmsRender.tsx';
import { findElement } from '../src/worker/cmsPublic.ts';

const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const payloadOf = (html, id) => {
  const m = new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html);
  if (!m) throw new Error(`no #${id} payload`);
  return JSON.parse(m[1]);
};
const slice = (html, open, tag) => {
  const range = findElement(html, open, tag);
  if (!range) throw new Error(`no ${open}`);
  return html.slice(...range);
};

let failed = 0;
function check(name, built, rendered) {
  if (built === rendered) {
    console.log(`✔ ${name}: Worker render matches the build (${built.length} bytes)`);
    return;
  }
  failed++;
  let i = 0;
  while (built[i] === rendered[i]) i++;
  console.error(`✖ ${name}: differs at byte ${i}`);
  console.error(`  build : …${built.slice(Math.max(0, i - 80), i + 80)}…`);
  console.error(`  worker: …${rendered.slice(Math.max(0, i - 80), i + 80)}…`);
}

const home = read('index.html');
const payload = payloadOf(home, 'cms-home');
check('homepage #week', slice(home, /<section id="week"/, 'section'), renderWeekSection(payload));
check('homepage #geleenthede', slice(home, /<section id="geleenthede"/, 'section'), renderEventsSection(payload));
check('homepage #oor', slice(home, /<section id="oor"/, 'section'), renderAboutSection(payload));

const shell = read('page-shell/index.html');
const shellPayload = payloadOf(shell, 'cms-page');
if (shellPayload.page !== null) throw new Error('page-shell payload should be empty');
// The shell renders its empty placeholder page; so must the Worker, given none.
const { CmsPageView } = await import('../src/components/react/CmsPageView.tsx');
const { renderToString } = await import('react-dom/server');
const { createElement } = await import('react');
check('page shell root', slice(shell, /<div id="cms-page-root"/, 'div'), renderToString(createElement(CmsPageView)).replace(/^(?:<link\b[^>]*>)+/, ''));
// And renderPageRoot is that same component with a page passed in.
if (!renderPageRoot({ slug: 'x', title: { af: 'T', en: 'T' }, eyebrow: { af: '', en: '' }, intro: { af: '', en: '' }, blocks: [] }).startsWith('<div id="cms-page-root"')) {
  failed++;
  console.error('✖ renderPageRoot does not render the #cms-page-root element');
}

if (failed) process.exit(1);
