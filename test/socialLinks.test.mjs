import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { SOCIAL_LINKS, SITE } from '../src/data/site.ts';

const { Footer } = await import('../src/components/react/Footer.tsx');
const { RequestPage } = await import('../src/components/react/RequestPage.tsx');
const { LanguageProvider } = await import('../src/context/LanguageContext.tsx');

/*
 * The three channels live once, in SOCIAL_LINKS. The footer's "Besoek ons"
 * column and /connect's card render that list; nothing else types a URL.
 */

const EXPECTED = [
  'https://www.youtube.com/@SDATygerberg/streams',
  'https://www.instagram.com/sdatygerberg',
  'https://www.facebook.com/SDATygerbergStream',
];

const anchors = (html) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => ({ href: m[1], tag: m[0] }));

describe('social links', () => {
  test('the URLs are verbatim and in display order', () => {
    assert.deepEqual(
      SOCIAL_LINKS.map((l) => l.url),
      EXPECTED,
    );
  });

  test('YouTube is the same URL the hero uses, not a second copy', () => {
    assert.equal(SOCIAL_LINKS[0].url, SITE.youtubeStreamsUrl);
  });

  test('the footer renders all three under the address, opening a new tab', () => {
    const html = renderToString(createElement(LanguageProvider, null, createElement(Footer)));
    const address = html.indexOf(SITE.address);
    const times = html.indexOf('Dienstye');
    for (const url of EXPECTED) {
      const at = html.indexOf(`href="${url}"`);
      assert.ok(at > address && at < times, `${url} sits in the Besoek ons column`);
      const tag = anchors(html).find((a) => a.href === url).tag;
      assert.match(tag, /target="_blank"/);
      assert.match(tag, /rel="noopener"/);
      assert.match(tag, /min-h-11/, '44px target');
    }
    assert.match(html, />Volg ons</);
  });

  test('/connect renders them above Kry Aanwysings; /bible-studies does not', () => {
    const connect = renderToString(createElement(RequestPage, { topic: 'connect' }));
    const directions = connect.indexOf(SITE.directionsUrl.replaceAll('&', '&amp;'));
    for (const url of EXPECTED) {
      const at = connect.indexOf(`href="${url}"`);
      assert.ok(at > 0 && at < directions, `${url} precedes the directions link`);
    }
    const study = renderToString(createElement(RequestPage, { topic: 'bible-study' }));
    for (const url of EXPECTED.slice(1)) assert.equal(study.indexOf(url), -1);
  });
});
