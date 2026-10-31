import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { signSession } from '../src/worker/auth.ts';
import { scriptJson } from '../src/lib/cms/public.ts';
import { r2Mock } from './r2Mock.mjs';

/*
 * A page made from the template publishes at /<slug>/ and is 404 to the
 * public until then (C-70). Exercised through the Worker's own router, the
 * way a visitor and a board member reach it.
 */

globalThis.caches ??= { default: { async match() {}, async put() {} } };
const { default: worker } = await import('../src/worker/index.ts');
const { renderPageRoot } = await import('../src/worker/cmsRender.tsx');
const { StandardPageBody } = await import('../src/components/react/StandardPage.tsx');
const { LanguageProvider } = await import('../src/context/LanguageContext.tsx');

const SECRET = 's';
const BOARD = 'boss@example.co.za';
const shell = () =>
  `<html><head><title>x</title><link rel="canonical" href="https://sdatygerberg.co.za/page-shell/"></head><body>` +
  `<script type="application/json" id="cms-page">${scriptJson({ page: null })}</script>` +
  renderPageRoot({ slug: 'page-shell', title: { af: '', en: '' }, eyebrow: { af: '', en: '' }, intro: { af: '', en: '' }, blocks: [] }) +
  `</body></html>`;
const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://sdatygerberg.co.za/</loc></url></urlset>`;

const env = {
  SESSION_SECRET: SECRET,
  BOARD_ALLOWED_EMAILS: BOARD,
  CMS: r2Mock(),
  ASSETS: {
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === '/page-shell/') return new Response(shell(), { headers: { 'Content-Type': 'text/html' } });
      if (pathname === '/sitemap.xml') return new Response(sitemap, { headers: { 'Content-Type': 'application/xml' } });
      return new Response('the 404 page', { status: 404 });
    },
  },
};
const ctx = { waitUntil() {} };
const cookie = `__Host-kerkraad=${await signSession(BOARD, SECRET)}`;
const get = (path, headers = {}) => worker.fetch(new Request(`https://x${path}`, { headers }), env, ctx);
const put = (body) =>
  worker.fetch(
    new Request('https://x/api/cms/pages', {
      method: 'PUT',
      headers: { cookie, origin: 'https://x', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  );

const L = (af, en = af) => ({ af, en });
const page = {
  slug: 'somerkamp',
  title: L('Somerkamp', 'Summer Camp'),
  eyebrow: L('Jeug', 'Youth'),
  intro: L('Drie dae by die see.', 'Three days by the sea.'),
  blocks: [
    { type: 'text', heading: L('Wat om te bring'), body: L('Slaapsak.\n\nTandeborsel.') },
    { type: 'callout', heading: L('Nog ’n vraag?', 'Any questions?'), text: L(''), button: { label: L('Kontak ons', 'Contact us'), href: '/connect/' } },
  ],
};

describe('a page from the template', () => {
  test('is 404 while a draft, live once published, 404 again once unpublished', async () => {
    const created = await put({ rev: 0, page });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).page.status, 'draft');

    const draft = await get('/somerkamp/');
    assert.equal(draft.status, 404);
    assert.equal(await draft.text(), 'the 404 page');
    assert.doesNotMatch(await (await get('/sitemap.xml')).text(), /somerkamp/, 'a draft is not in the sitemap');

    const published = await put({ rev: 1, page, publish: true });
    assert.equal(published.status, 200);

    const live = await get('/somerkamp/');
    assert.equal(live.status, 200);
    const html = await live.text();
    assert.match(html, /<h1[^>]*>Somerkamp<\/h1>/);
    assert.match(html, /Wat om te bring/);
    assert.match(html, /<p class="[^"]*">Slaapsak\.<\/p><p class="[^"]*">Tandeborsel\.<\/p>/, 'blank line = new paragraph');
    assert.match(html, /<link rel="canonical" href="https:\/\/sdatygerberg\.co\.za\/somerkamp\/">/);
    assert.match(await (await get('/sitemap.xml')).text(), /<loc>https:\/\/sdatygerberg\.co\.za\/somerkamp\/<\/loc>/);

    // Editing a live page keeps it live and leaves the public copy alone until the next Publish.
    const edited = await put({ rev: 2, page: { ...page, title: L('Somerkamp 2027', 'Summer Camp 2027') } });
    const body = await edited.json();
    assert.equal(body.page.status, 'live');
    assert.equal(body.dirty, true);
    assert.match(await (await get('/somerkamp/')).text(), /<h1[^>]*>Somerkamp<\/h1>/);

    const off = await put({ action: 'unpublish', slug: 'somerkamp' });
    assert.equal(off.status, 200);
    assert.equal((await get('/somerkamp/')).status, 404);
  });

  test('the shell itself is never served', async () => {
    assert.equal((await get('/page-shell/')).status, 404);
  });
});

describe('the block library', () => {
  const blocks = [
    { type: 'infoCard', label: L('Elke Woensdag'), big: L('13:00 – 16:00'), where: L('By die kerk'), note: L('Met Lr. Arnold Neuhoff') },
    { type: 'cardGrid', heading: L('Op die Sabbat'), intro: L(''), cards: [{ label: L('0 – 3 jaar'), title: L('Beginners'), text: L('') }] },
    { type: 'timeSlots', day: L('Donderdag'), title: L('5 November 2026'), slots: ['13:00 – 13:45', '14:00 – 14:45'] },
    { type: 'timeSlots', day: L('Donderdag'), title: L('10 Desember 2026'), slots: ['13:00 – 13:45'] },
    { type: 'text', heading: L('Opskrif'), body: L('Paragraaf.') },
    { type: 'faq', items: [{ q: L('Vraag?'), a: L('Antwoord.') }] },
    { type: 'image', src: '/media/pages/abc-123.jpg', alt: L('Die saal'), caption: L('Onderskrif') },
    { type: 'contactForm', topic: 'connect' },
    { type: 'callout', heading: L('Nog ’n vraag?'), text: L(''), button: { label: L('Kontak ons'), href: '/connect/' } },
  ];
  const html = renderToString(
    createElement(LanguageProvider, null, createElement(StandardPageBody, { header: { eyebrow: L('E'), title: L('T'), intro: L('I') }, blocks, lang: 'af' })),
  );

  test('every block type renders', () => {
    for (const text of ['Elke Woensdag', 'Op die Sabbat', '5 November 2026', 'Paragraaf.', 'Vraag?', 'Die saal', 'Kontak ons']) assert.match(html, new RegExp(text));
    assert.match(html, /<source type="image\/webp" srcSet="\/media\/pages\/abc-123\.webp"\/>/);
  });

  test('adjacent time-slot blocks are one list, as /blood-bank shows its dates', () => {
    const lists = html.match(/<ul class="grid gap-4">/g) ?? [];
    assert.equal(lists.length, 1);
  });

  test('the contact form is not rendered server-side — its Turnstile flag is build-only', () => {
    assert.match(html, /Vorm laai…/);
    assert.doesNotMatch(html, /<form/);
  });

  test('orange buttons carry dark text', () => {
    assert.match(html, /bg-orange[^"]*text-ink/);
  });
});
