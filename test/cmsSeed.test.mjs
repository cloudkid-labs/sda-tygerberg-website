import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readdirSync } from 'node:fs';
import { seedEvents, seedHeads, seedPages } from '../src/lib/cms/seed.ts';
import { homeCopy } from '../src/data/homeCopy.ts';
import { departmentHeads, shownDepartmentHeads } from '../src/data/departmentHeads.ts';
import { RESERVED_SLUGS, validateEvents, validateHeads, validatePage, isValidSlug } from '../src/lib/cms/validate.ts';

/*
 * The seed is the hand-coded homepage, read from source rather than retyped
 * (C-70), and every seed passes the same validation the API applies.
 */

describe('seed', () => {
  test('events are the homepage cards verbatim, in order', () => {
    const events = seedEvents();
    assert.deepEqual(events.map((e) => e.name.af), homeCopy.af.week.map((w) => w.name));
    assert.deepEqual(events.map((e) => e.name.en), homeCopy.en.week.map((w) => w.name));
    assert.deepEqual(events.map((e) => `${e.start} – ${e.end}`), homeCopy.af.week.map((w) => w.time));
    assert.deepEqual(events.map((e) => e.where.af), homeCopy.af.week.map((w) => w.place ?? ''));
    const counselling = events.find((e) => e.id === 'pastorale-berading');
    assert.equal(counselling.day, 'Woensdag');
    assert.equal(counselling.where.af, 'By die kerk · 45 min-sessies op die uur');
    const youth = events.find((e) => e.link);
    assert.deepEqual(youth.link, { pageSlug: 'youth', label: { af: 'Sien meer', en: 'See more' } });
    assert.ok(events.every((e) => e.status === 'live'));
  });

  test('heads are the whole roster; the visible ones are the 14 the carousel showed', () => {
    const heads = seedHeads();
    assert.equal(heads.length, departmentHeads.length);
    assert.deepEqual(heads.filter((h) => h.visible).map((h) => h.id), shownDepartmentHeads.map((h) => h.id));
    assert.equal(heads.filter((h) => h.visible).length, 14);
    for (const [i, h] of heads.entries()) {
      assert.equal(h.name, departmentHeads[i].name, 'names verbatim');
      assert.deepEqual(h.positions.map((p) => p.af), departmentHeads[i].roles.af);
      assert.deepEqual(h.positions.map((p) => p.en), departmentHeads[i].roles.en);
    }
    assert.equal(heads.find((h) => h.id === 'diakens').photo.src, '/images/hod/TG-DH-Graig.jpg');
  });

  test('the counselling page is a draft with a booking TODO, never invented', () => {
    const [page] = seedPages();
    assert.equal(page.slug, 'pastoral-counselling');
    assert.equal(page.status, 'draft');
    const callout = page.blocks.find((b) => b.type === 'callout');
    assert.match(callout.text.af, /TODO/);
    const slots = page.blocks.find((b) => b.type === 'timeSlots');
    assert.deepEqual(slots.slots, ['13:00 – 13:45', '14:00 – 14:45', '15:00 – 15:45']);
  });

  test('every seed passes API validation', () => {
    assert.ok(validateEvents(seedEvents()).ok);
    assert.ok(validateHeads(seedHeads()).ok);
    for (const page of seedPages()) assert.ok(validatePage(page).ok, JSON.stringify(validatePage(page)));
  });
});

describe('reserved slugs', () => {
  test('every route under src/pages is reserved — a CMS page can never shadow one', () => {
    const pages = new URL('../src/pages/', import.meta.url);
    const names = readdirSync(pages).map((n) => n.replace(/\.(astro|ts)$/, '').replace(/\.(txt|xml)$/, ''));
    for (const name of names) assert.ok(RESERVED_SLUGS.has(name), `${name} must be in RESERVED_SLUGS`);
  });

  test('slug format', () => {
    assert.ok(isValidSlug('pastoral-counselling'));
    for (const bad of ['Pastoral', 'a--b', '-a', 'a-', 'a/b', 'members', '', 'x'.repeat(61)]) assert.equal(isValidSlug(bad), false, bad);
  });
});
