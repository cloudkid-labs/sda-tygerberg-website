import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { diffEvents, diffHeads, diffPage } from '../src/lib/cms/auditDiff.ts';
import { cmsCopy } from '../src/data/cmsCopy.ts';
import { describeChange } from '../src/components/react/cms/RecentChanges.tsx';

/*
 * Recent changes must say WHAT changed (C-70): which item, which fields,
 * where it moved — by name, not by id, and nothing for a save that changed
 * nothing.
 */

const ev = (id, af, extra = {}) => ({ id, kind: 'weekly', day: 'Sabbat', start: '09:00', end: '10:00', name: { af, en: af }, where: { af: 'Kerk', en: 'Church' }, order: 0, status: 'live', updatedBy: 'x', updatedAt: 'y', ...extra });
const head = (id, name, extra = {}) => ({ id, name, positions: [{ af: 'Leier', en: 'Leader' }], visible: true, order: 0, updatedBy: 'x', updatedAt: 'y', ...extra });
const say = (changes, lang = 'en') => changes.map((c) => describeChange(c, cmsCopy[lang]));

describe('events', () => {
  const base = [ev('a', 'Biduur'), ev('b', 'Jeug'), ev('c', 'Koor')];

  test('nothing changed → no changes (stamps and order are bookkeeping)', () => {
    const same = base.map((e, i) => ({ ...e, order: i + 5, updatedAt: 'later' }));
    assert.deepEqual(diffEvents(base, same), []);
  });

  test('an edit names the event and the fields', () => {
    const next = [ev('a', 'Biduur', { start: '18:00', where: { af: 'Saal', en: 'Hall' } }), base[1], base[2]];
    assert.deepEqual(say(diffEvents(base, next)), ['Biduur: changed start time and place']);
    assert.deepEqual(say(diffEvents(base, next), 'af'), ['Biduur: begintyd en plek verander']);
  });

  test('a move names only the item that moved, with positions', () => {
    const next = [base[2], base[0], base[1]];
    assert.deepEqual(say(diffEvents(base, next)), ['Moved Koor from position 3 to 1']);
  });

  test('add, remove and draft ↔ live by name', () => {
    const next = [{ ...base[0], status: 'draft' }, base[1], ev('d', 'Gesondheid')];
    assert.deepEqual(say(diffEvents(base, next)), ['Moved Biduur back to draft', 'Added Gesondheid', 'Published Gesondheid', 'Removed Koor']);
  });
});

describe('heads', () => {
  test('photo, positions and visibility by person', () => {
    const before = [head('p1', 'Lr A Neuhoff'), head('p2', 'Sr B')];
    const after = [head('p1', 'Lr A Neuhoff', { photo: { src: '/media/heads/p1.jpg', alt: 'A' } }), head('p2', 'Sr B', { visible: false, positions: [{ af: 'Diakones', en: 'Deaconess' }] })];
    assert.deepEqual(say(diffHeads(before, after)), ['Lr A Neuhoff: changed photo', 'Sr B: changed positions', 'Hid Sr B']);
  });
});

describe('pages', () => {
  const l = (s) => ({ af: s, en: s });
  const page = (blocks, extra = {}) => ({ slug: 'p', title: l('T'), eyebrow: l('E'), intro: l('I'), blocks, status: 'draft', updatedBy: 'x', updatedAt: 'y', ...extra });
  const text = (h) => ({ type: 'text', heading: l(h), body: l('b') });
  const faq = { type: 'faq', items: [{ q: l('q'), a: l('a') }] };

  test('first save of a new page has nothing to compare', () => {
    assert.deepEqual(diffPage(null, page([])), []);
  });

  test('page fields, an edited block, an added and a removed block', () => {
    const before = page([text('One'), faq, text('Three')]);
    const after = page([{ ...text('One'), heading: l('Uno') }, text('Three'), { type: 'image', src: '/m.jpg', alt: l('a'), caption: l('c') }], { title: l('New') });
    assert.deepEqual(say(diffPage(before, after)), [
      'Page: changed title',
      'Block 1 (Text): changed heading',
      'Added Block 3 (Image)',
      'Removed Block 2 (FAQ)',
    ]);
  });

  test('swapping two blocks is a move, not an edit', () => {
    const before = page([text('One'), faq]);
    const after = page([faq, text('One')]);
    assert.deepEqual(say(diffPage(before, after)), ['Moved Block 2 (Text) from position 1 to 2']);
  });

  test('status and stamps alone are not a change', () => {
    assert.deepEqual(diffPage(page([faq]), page([faq], { status: 'live', updatedAt: 'z' })), []);
  });
});
