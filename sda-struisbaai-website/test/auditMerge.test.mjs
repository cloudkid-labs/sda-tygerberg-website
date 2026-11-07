import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { diffEvents, diffPage, eventsOrder, isMoveOnly, movesBetween, pageOrder } from '../src/lib/cms/auditDiff.ts';
import { mergeMoves, MOVE_MERGE_WINDOW_MS } from '../src/lib/cms/auditMerge.ts';
import { cmsCopy } from '../src/data/cmsCopy.ts';
import { describeChange } from '../src/components/react/cms/RecentChanges.tsx';

/*
 * Back-to-back saves that only moved things read as one Recent changes entry
 * (C-70). The entries here are built the way the Worker writes them: the
 * diff's changes, plus the order around a move-only save.
 */

const T0 = Date.parse('2026-11-01T10:00:00Z');
const ev = (id) => ({ id, kind: 'weekly', day: 'Sabbat', start: '09:00', end: '10:00', name: { af: id, en: id }, where: { af: 'K', en: 'C' }, order: 0, status: 'live' });
const swap = (arr, i, j) => { const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };
const say = (e) => e.changes.map((c) => describeChange(c, cmsCopy.en));

/** Replays saves of the events list; returns the audit lines newest first. */
function eventsLog(start, steps, extra = () => ({})) {
  let items = start;
  const log = [];
  steps.forEach((step, i) => {
    const next = step(items);
    const changes = diffEvents(items, next);
    if (changes.length) {
      log.push({
        at: new Date(T0 + i * 60_000).toISOString(),
        by: 'a@x',
        action: 'events.save',
        target: 'events',
        changes,
        ...(isMoveOnly(changes) ? { order: eventsOrder(items, next) } : {}),
        ...extra(i),
      });
    }
    items = next;
  });
  return log.reverse();
}

const five = ['Biduur', 'Pastoraal', 'Bybelstudie', 'Vlugbal', 'Jeug'].map(ev);

describe('order snapshot matches the diff', () => {
  test('movesBetween names the same moves the save did', () => {
    const perms = [[4, 0, 1, 2, 3], [1, 0, 2, 3, 4], [0, 2, 4, 1, 3], [4, 3, 2, 1, 0]];
    for (const p of perms) {
      const after = p.map((i) => five[i]);
      assert.deepEqual(movesBetween(eventsOrder(five, after)), diffEvents(five, after), String(p));
    }
  });

  test('page blocks too, with the block type and final number', () => {
    const l = (s) => ({ af: s, en: s });
    const pg = (blocks) => ({ slug: 'p', title: l('T'), eyebrow: l(''), intro: l(''), blocks, status: 'draft', updatedBy: 'x', updatedAt: 'y' });
    const a = { type: 'text', heading: l('A'), body: l('a') };
    const b = { type: 'faq', items: [{ q: l('q'), a: l('a') }] };
    const c = { type: 'text', heading: l('C'), body: l('c') };
    const before = pg([a, b, c]);
    const after = pg([c, a, b]);
    assert.deepEqual(movesBetween(pageOrder(before, after)), diffPage(before, after));
  });
});

describe('mergeMoves', () => {
  test('one card moved up three places by neighbour swaps is one move', () => {
    // Each swap alone is ambiguous: the diff names the neighbour that went down.
    const log = eventsLog(five, [(x) => swap(x, 4, 3), (x) => swap(x, 3, 2), (x) => swap(x, 2, 1)]);
    assert.equal(log.length, 3);
    const out = mergeMoves(log);
    assert.equal(out.length, 1);
    assert.equal(out[0].at, log[0].at);
    assert.deepEqual(say(out[0]), ['Moved Jeug from position 5 to 2']);
  });

  test('a move and its undo leave no entry', () => {
    const log = eventsLog(five, [(x) => swap(x, 0, 1), (x) => swap(x, 0, 1)]);
    assert.equal(log.length, 2);
    assert.deepEqual(mergeMoves(log), []);
  });

  test('a single move-only save is shown exactly as stored', () => {
    const log = eventsLog(five, [(x) => swap(x, 0, 4)]);
    assert.deepEqual(mergeMoves(log), log);
  });

  test('an edit in between, or in the same save, breaks the run', () => {
    const edit = (x) => x.map((e, i) => (i === 0 ? { ...e, start: '06:00' } : e));
    const between = eventsLog(five, [(x) => swap(x, 4, 3), edit, (x) => swap(x, 3, 2)]);
    assert.equal(mergeMoves(between).length, 3);
    const mixed = eventsLog(five, [(x) => swap(x, 4, 3), (x) => edit(swap(x, 3, 2))]);
    assert.equal(mixed[0].order, undefined);
    assert.equal(mergeMoves(mixed).length, 2);
  });

  test('another person, or a gap over the window, stays separate', () => {
    const steps = [(x) => swap(x, 4, 3), (x) => swap(x, 3, 2)];
    assert.equal(mergeMoves(eventsLog(five, steps, (i) => ({ by: i ? 'b@x' : 'a@x' }))).length, 2);
    const late = (i) => ({ at: new Date(T0 + i * (MOVE_MERGE_WINDOW_MS + 60_000)).toISOString() });
    assert.equal(mergeMoves(eventsLog(five, steps, late)).length, 2);
  });

  test('saves that do not hand off (another change landed between) stay separate', () => {
    const log = eventsLog(five, [(x) => swap(x, 4, 3), (x) => swap(x, 3, 2)]);
    // The older save's after-order no longer matches the newer one's before.
    const broken = [log[0], { ...log[1], order: { ...log[1].order, after: [...log[1].order.after].reverse() } }];
    assert.equal(mergeMoves(broken).length, 2);
  });

  test('older lines without an order pass through untouched', () => {
    const old = [
      { at: new Date(T0 + 3e5).toISOString(), by: 'a@x', action: 'events.save', target: 'events', detail: '3 events' },
      { at: new Date(T0 + 2e5).toISOString(), by: 'a@x', action: 'events.save', target: 'events', changes: [{ op: 'moved', label: 'Koor', from: 2, to: 1 }] },
      { at: new Date(T0 + 1e5).toISOString(), by: 'a@x', action: 'events.save', target: 'events', changes: [{ op: 'moved', label: 'Koor', from: 3, to: 2 }] },
      { at: new Date(T0).toISOString(), by: 'a@x', action: 'page.publish', target: '/a/' },
    ];
    assert.deepEqual(mergeMoves(old), old);
  });

  test('does not touch its input', () => {
    const log = eventsLog(five, [(x) => swap(x, 4, 3), (x) => swap(x, 3, 2)]);
    const copy = structuredClone(log);
    mergeMoves(log);
    assert.deepEqual(log, copy);
  });
});
