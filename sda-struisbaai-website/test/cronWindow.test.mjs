import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { isWithinCronWindow, isValidCronWindow, zonedNow } from '../src/worker/cronWindow.ts';

const TZ = 'Africa/Johannesburg';

/** 2026-08-22 is a Saturday. SAST is UTC+2 and does not observe DST. */
const sat = (hour, minute = 0) => new Date(Date.UTC(2026, 7, 22, hour - 2, minute));
/** 2026-08-23, a Sunday. */
const sun = (hour, minute = 0) => new Date(Date.UTC(2026, 7, 23, hour - 2, minute));

describe('isWithinCronWindow', () => {
  test('the deployed window', () => {
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sat(9), TZ), true);
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sat(12, 59), TZ), true);
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sat(13), TZ), false);
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sat(8, 59), TZ), false);
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sun(10), TZ), false);
  });

  test('a bare value matches only itself', () => {
    assert.equal(isWithinCronWindow('* 9 * * 6', sat(9), TZ), true);
    assert.equal(isWithinCronWindow('* 9 * * 6', sat(10), TZ), false);
  });

  test('N/step runs from N to the end of the field', () => {
    // The regression: `9/2` used to collapse to `9` alone, so 11:00 and 13:00
    // reported outside a window standard cron puts them inside.
    for (const hour of [9, 11, 13, 15, 17, 19, 21, 23]) {
      assert.equal(isWithinCronWindow('* 9/2 * * 6', sat(hour), TZ), true, `${hour}:00 should match`);
    }
    for (const hour of [8, 10, 12, 14]) {
      assert.equal(isWithinCronWindow('* 9/2 * * 6', sat(hour), TZ), false, `${hour}:00 should not`);
    }
  });

  test('a range with a step stays bounded by the range', () => {
    assert.equal(isWithinCronWindow('* 9-15/2 * * 6', sat(11), TZ), true);
    assert.equal(isWithinCronWindow('* 9-15/2 * * 6', sat(12), TZ), false);
    assert.equal(isWithinCronWindow('* 9-15/2 * * 6', sat(17), TZ), false);
  });

  test('*/step spans the whole field', () => {
    assert.equal(isWithinCronWindow('*/5 9-12 * * 6', sat(10, 5), TZ), true);
    assert.equal(isWithinCronWindow('*/5 9-12 * * 6', sat(10, 6), TZ), false);
  });

  test('lists match if any term does', () => {
    assert.equal(isWithinCronWindow('* 9,17 * * 6', sat(17), TZ), true);
    assert.equal(isWithinCronWindow('* 9,17 * * 6', sat(13), TZ), false);
  });

  test('7 is Sunday as well as 0', () => {
    assert.equal(isWithinCronWindow('* 10 * * 7', sun(10), TZ), true);
    assert.equal(isWithinCronWindow('* 10 * * 0', sun(10), TZ), true);
    assert.equal(isWithinCronWindow('* 10 * * 7', sat(10), TZ), false);
  });

  test('malformed expressions fail closed — C-15', () => {
    for (const expr of ['* 9/0 * * 6', '* 25 * * 6', '* 9-8 * * 6', 'bogus', '* * * *', '', '* 9-12 * * 6 7']) {
      assert.equal(isWithinCronWindow(expr, sat(10), TZ), false, `${expr} must not match`);
    }
    // One malformed term poisons the whole field, even beside a good one.
    assert.equal(isWithinCronWindow('* 9,bogus * * 6', sat(9), TZ), false);
  });

  test('an unknown timezone fails closed', () => {
    assert.equal(isWithinCronWindow('* 9-12 * * 6', sat(10), 'Not/AZone'), false);
    assert.equal(zonedNow(sat(10), 'Not/AZone'), null);
  });
});

describe('isValidCronWindow', () => {
  test('accepts every form the matcher supports', () => {
    for (const expr of ['* 9-12 * * 6', '* 9/2 * * 6', '* 9-15/2 * * 6', '*/5 9-12 * * 6', '* 9,17 * * 6']) {
      assert.equal(isValidCronWindow(expr, TZ, sat(10)), true, `${expr} should be valid`);
    }
  });

  test('rejects what can never fire', () => {
    for (const expr of ['* 9/0 * * 6', '* 25 * * 6', '* 9-8 * * 6', 'bogus', '* * * *']) {
      assert.equal(isValidCronWindow(expr, TZ, sat(10)), false, `${expr} should be invalid`);
    }
  });

  test('agrees with the matcher: anything it calls valid matches somewhere', () => {
    // The bug C-15 could not catch: `9/2` was "valid" because 9 matched, while
    // every other hour it names reported outside the window.
    const expr = '* 9/2 * * 6';
    assert.equal(isValidCronWindow(expr, TZ, sat(10)), true);
    const matched = [...Array(24).keys()].filter((h) => isWithinCronWindow(expr, sat(h), TZ));
    assert.deepEqual(matched, [9, 11, 13, 15, 17, 19, 21, 23]);
  });
});
