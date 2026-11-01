import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { r2Mock } from './r2Mock.mjs';
import { seedEvents, seedHeads, seedPages } from '../src/lib/cms/seed.ts';
import { publicEvents, scriptJson } from '../src/lib/cms/public.ts';
import { johannesburgDate, isExpired } from '../src/lib/cms/time.ts';

/*
 * What visitors get from the CMS (C-70): live items only, never a draft and
 * never an audit field; once-off events gone the day after their date in
 * Johannesburg; CMS pages at /<slug>/ only once published; and Worker-written
 * HTML that matches what the island renders from the same payload.
 */

const { buildHomePayload } = await import('../src/lib/cms/payload.ts');
const { renderWeekSection, renderEventsSection, renderAboutSection, renderPageRoot } = await import('../src/worker/cmsRender.tsx');
const { rebuildEventPages } = await import('../src/worker/cmsStore.ts');
const { rewriteHome, serveHome, serveCmsPage, findElement } = await import('../src/worker/cmsPublic.ts');

const RENDER = { week: renderWeekSection, events: renderEventsSection, about: renderAboutSection, page: renderPageRoot };

/** The homepage as the build would emit it, reduced to what the Worker edits. */
function builtHome() {
  const payload = buildHomePayload();
  return `<!doctype html><html lang="af"><head><title>Home</title></head><body>
<script type="application/json" id="cms-home">${scriptJson(payload)}</script>
<astro-island><div><main>${renderWeekSection(payload)}${renderEventsSection(payload)}${renderAboutSection(payload)}</main></div></astro-island>
</body></html>`;
}

function builtShell() {
  return `<!doctype html><html lang="af"><head><title>Tygerberg SDA Kerk</title>
<meta name="description" content="Tygerberg SDA Kerk"><link rel="canonical" href="https://sdatygerberg.co.za/page-shell/">
<meta property="og:url" content="https://sdatygerberg.co.za/page-shell/"><meta property="og:title" content="Tygerberg SDA Kerk"></head><body>
<script type="application/json" id="cms-page">${scriptJson({ page: null })}</script>
<astro-island>${renderPageRoot({ slug: 'page-shell', title: { af: '', en: '' }, eyebrow: { af: '', en: '' }, intro: { af: '', en: '' }, blocks: [] })}</astro-island>
</body></html>`;
}

const assets = {
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/') return new Response(builtHome(), { headers: { 'Content-Type': 'text/html', ETag: '"build"' } });
    if (pathname === '/page-shell/') return new Response(builtShell(), { headers: { 'Content-Type': 'text/html' } });
    return new Response('404 page', { status: 404 });
  },
};

const payloadIn = (html) => JSON.parse(/<script[^>]*id="cms-home"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
const section = (html, id) => html.slice(...findElement(html, new RegExp(`<section id="${id}"`), 'section'));

const event = (over) => ({
  id: 'x',
  kind: 'weekly',
  day: 'Maandag',
  start: '18:00',
  end: '19:00',
  name: { af: 'Naam', en: 'Name' },
  where: { af: '', en: '' },
  order: 99,
  status: 'live',
  updatedBy: 'member@example.co.za',
  updatedAt: '2026-10-31T10:00:00.000Z',
  ...over,
});

async function bucketWith({ events, heads, pages = [], live = [] } = {}) {
  const b = r2Mock();
  if (events) await b.put('content/events.json', JSON.stringify({ rev: 1, items: events }));
  if (heads) await b.put('content/heads.json', JSON.stringify({ rev: 1, items: heads }));
  for (const page of pages) await b.put(`pages/draft/${page.slug}.json`, JSON.stringify({ rev: 1, page }));
  for (const page of live) await b.put(`pages/live/${page.slug}.json`, JSON.stringify({ page }));
  return b;
}

describe('Johannesburg dates', () => {
  test('the date turns at midnight SAST, not UTC', () => {
    assert.equal(johannesburgDate(new Date('2026-11-05T21:59:59Z')), '2026-11-05');
    assert.equal(johannesburgDate(new Date('2026-11-05T22:00:00Z')), '2026-11-06');
  });

  test('a once-off is visible on its date and gone the day after', () => {
    const once = event({ kind: 'once', day: undefined, date: '2026-11-05' });
    assert.equal(isExpired(once, '2026-11-05'), false);
    assert.equal(isExpired(once, '2026-11-06'), true);
    assert.equal(isExpired(event({}), '2030-01-01'), false, 'weekly never expires');
  });
});

describe('the homepage', () => {
  test('with an empty bucket it is the build, byte for byte', async () => {
    const res = await serveHome(new Request('https://x/'), { ASSETS: assets, CMS: r2Mock() }, RENDER, new Date('2026-10-31T08:00:00Z'));
    assert.equal(await res.text(), builtHome());
  });

  test('a published event shows; a draft never does, nor any audit field', async () => {
    const events = [
      ...seedEvents(),
      event({ id: 'gepubliseer', name: { af: 'Gepubliseerde Aand', en: 'Published Evening' }, order: 10 }),
      event({ id: 'konsep', name: { af: 'Geheime Konsep', en: 'Secret Draft' }, status: 'draft', order: 11 }),
    ];
    const res = await serveHome(new Request('https://x/'), { ASSETS: assets, CMS: await bucketWith({ events }) }, RENDER, new Date('2026-10-31T08:00:00Z'));
    const html = await res.text();
    assert.match(section(html, 'week'), /Gepubliseerde Aand/);
    assert.doesNotMatch(html, /Geheime Konsep|Secret Draft/);
    assert.doesNotMatch(html, /member@example\.co\.za|updatedBy/);
    assert.equal(res.headers.get('etag'), null, 'no stale validator for rewritten HTML');
  });

  test('the Worker HTML is exactly what the island renders from the payload it wrote', async () => {
    const events = [event({ id: 'a', name: { af: 'Eerste', en: 'First' }, order: 0 }), ...seedEvents()];
    const heads = seedHeads().map((h, i) => (i === 1 ? { ...h, visible: false } : h));
    const res = await serveHome(new Request('https://x/'), { ASSETS: assets, CMS: await bucketWith({ events, heads }) }, RENDER, new Date('2026-10-31T08:00:00Z'));
    const html = await res.text();
    const payload = payloadIn(html);
    assert.equal(section(html, 'week'), renderWeekSection(payload));
    assert.equal(section(html, 'oor'), renderAboutSection(payload));
    assert.equal(payload.heads.length, 13);
    assert.ok(!payload.heads.some((h) => h.id === heads[1].id), 'a hidden head is not in the payload');
  });

  test('a once-off event disappears the day after its date (fixed clock)', async () => {
    const events = [...seedEvents(), event({ id: 'eenmalig', kind: 'once', day: undefined, date: '2026-11-05', name: { af: 'Eenmalige Byeenkoms', en: 'One-off' } })];
    const CMS = await bucketWith({ events });
    const on = async (iso) => (await (await serveHome(new Request('https://x/'), { ASSETS: assets, CMS }, RENDER, new Date(iso))).text());
    assert.match(section(await on('2026-11-05T21:59:00Z'), 'week'), /Eenmalige Byeenkoms/, 'still on the night itself, 23:59 SAST');
    assert.match(section(await on('2026-11-05T21:59:00Z'), 'week'), /5 November 2026/, 'labelled with its date');
    assert.doesNotMatch(await on('2026-11-05T22:00:00Z'), /Eenmalige Byeenkoms/, 'gone at 00:00 SAST the next day');
  });

  test('publicEvents orders by `order` and drops drafts', () => {
    const out = publicEvents([event({ id: 'b', order: 2 }), event({ id: 'a', order: 1 }), event({ id: 'd', status: 'draft', order: 0 })], '2026-10-31');
    assert.deepEqual(out.map((e) => e.id), ['a', 'b']);
    assert.ok(!('updatedBy' in out[0]) && !('status' in out[0]));
  });

  test('Events lists live pages marked showInEvents, newest publish first, and nothing else', async () => {
    const L = (af, en = af) => ({ af, en });
    const pg = (slug, over) => ({ slug, title: L(slug), eyebrow: L('Kamp'), intro: L('Inleiding'), blocks: [], status: 'live', updatedBy: 'member@example.co.za', ...over });
    const live = [
      pg('somerkamp', { showInEvents: true, updatedAt: '2026-10-01T00:00:00.000Z' }),
      pg('konferensie', { showInEvents: true, updatedAt: '2026-10-20T00:00:00.000Z' }),
      pg('gewone-bladsy', { updatedAt: '2026-10-25T00:00:00.000Z' }),
    ];
    const CMS = await bucketWith({ live, pages: [pg('konsep', { showInEvents: true, status: 'draft', updatedAt: '2026-10-30T00:00:00.000Z' })] });
    await rebuildEventPages(CMS);
    const html = await (await serveHome(new Request('https://x/'), { ASSETS: assets, CMS }, RENDER, new Date('2026-10-31T08:00:00Z'))).text();
    const payload = payloadIn(html);
    assert.deepEqual(payload.eventPages.map((p) => p.slug), ['konferensie', 'somerkamp'], 'live + marked only, newest first; drafts never');
    assert.ok(!('updatedBy' in payload.eventPages[0]), 'no audit fields reach the page');
    const events = section(html, 'geleenthede');
    assert.equal(events, renderEventsSection(payload), 'hydration-exact');
    assert.match(events, /href="\/konferensie\/"/);
    assert.doesNotMatch(events, /gewone-bladsy|konsep/);
  });

  test('the build ships an empty Events section that says so', () => {
    const html = renderEventsSection(buildHomePayload());
    assert.match(html, /^<section id="geleenthede"/);
    assert.match(html, /geen komende geleenthede/);
  });

  test('markers missing → the build is served, never a half-rewritten page', () => {
    assert.equal(rewriteHome('<html><body>no payload</body></html>', { events: [], heads: [] }, '2026-10-31', RENDER), null);
  });
});

describe('CMS pages at /<slug>/', () => {
  const draft = seedPages()[0];
  const livePage = { ...draft, status: 'live' };

  test('a draft is 404 to the public', async () => {
    const CMS = await bucketWith({ pages: [draft] });
    assert.equal(await serveCmsPage(new Request('https://x/pastoral-counselling/'), { ASSETS: assets, CMS }, RENDER), null);
  });

  test('a published page renders at /<slug>/ with its own title and canonical', async () => {
    const CMS = await bucketWith({ pages: [draft], live: [livePage] });
    const res = await serveCmsPage(new Request('https://x/pastoral-counselling/'), { ASSETS: assets, CMS }, RENDER);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Pastorale Berading · Tygerberg SDA Kerk<\/title>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/sdatygerberg\.co\.za\/pastoral-counselling\/">/);
    assert.match(html, /<h1[^>]*>Pastorale Berading<\/h1>/);
    assert.doesNotMatch(html, /updatedBy|seed"/);
    const payload = JSON.parse(/id="cms-page">([\s\S]*?)<\/script>/.exec(html)[1]);
    const root = html.slice(...findElement(html, /<div id="cms-page-root"/, 'div'));
    assert.equal(root, renderPageRoot(payload.page), 'Worker HTML matches the island render');
  });

  test('without a trailing slash it redirects; unknown slugs and other paths fall through', async () => {
    const CMS = await bucketWith({ live: [livePage] });
    const res = await serveCmsPage(new Request('https://x/pastoral-counselling'), { ASSETS: assets, CMS }, RENDER);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/pastoral-counselling/');
    assert.equal(await serveCmsPage(new Request('https://x/onbekend/'), { ASSETS: assets, CMS }, RENDER), null);
    assert.equal(await serveCmsPage(new Request('https://x/a/b/'), { ASSETS: assets, CMS }, RENDER), null);
  });
});
