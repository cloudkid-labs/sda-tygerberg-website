import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { robotsTxt } from '../src/pages/robots.txt.ts';

const SITEMAP = 'https://sdatygerberg.co.za/sitemap.xml';

describe('robotsTxt', () => {
  test('the preview disallows everything and names no sitemap', () => {
    const txt = robotsTxt(false, SITEMAP);
    assert.match(txt, /^User-agent: \*$/m);
    assert.match(txt, /^Disallow: \/$/m);
    assert.doesNotMatch(txt, /Sitemap:/i);
    assert.doesNotMatch(txt, /cloudkid/i);
  });

  test('production allows crawling and advertises the sitemap', () => {
    const txt = robotsTxt(true, SITEMAP);
    assert.match(txt, /^User-agent: \*$/m);
    assert.match(txt, /^Allow: \/$/m);
    assert.match(txt, new RegExp(`^Sitemap: ${SITEMAP}$`, 'm'));
    assert.doesNotMatch(txt, /Disallow:/i);
  });
});
