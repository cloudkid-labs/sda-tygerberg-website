/**
 * Minimal cron matcher used as a *predicate on the current time*, not a
 * scheduler — so `* 9-12 * * 6` means "any minute 09:00-12:59 on Saturdays".
 * CONCERNS.md C-14.
 *
 * Standard 5 fields, supporting `*`, `5`, `9-12`, `1,3,5` and steps. Day-of-week
 * is 0-6 with 0 = Sunday; 7 is accepted as Sunday too.
 */

const FIELD_RANGES: { min: number; max: number }[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (0 and 7 are both Sunday)
];

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Shape first, so `Number()` cannot rescue malformed input — C-15.
const TERM_PATTERN = /^(\*|\d{1,2}|\d{1,2}-\d{1,2})(\/\d{1,2})?$/;

function matchField(field: string, value: number, min: number, max: number): boolean {
  const terms = field.split(',');
  // Every term must be well-formed, not just the matching one — C-15.
  if (terms.length === 0 || !terms.every((term) => TERM_PATTERN.test(term))) return false;

  // The field then matches if *any* of those terms matches.
  return terms.some((term) => {
    const [range, stepText] = term.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return false;

    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(range);
      /*
       * `9/2` is "from 9 to the end of the field, every 2" in standard cron —
       * not "9 only". Collapsing hi to lo made `(value - lo) % step` reachable
       * for 9 alone, so `* 9/2 * * 6` matched 09:00 and silently missed 11:00
       * and 13:00. isValidCronWindow could not catch it either: 9 does match,
       * so the "matches nothing in its range" test passed. C-15
       */
      hi = stepText === undefined ? lo : max;
    }

    if (lo < min || hi > max || lo > hi) return false;
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  });
}

type ZonedNow = {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
};

/**
 * `now` as calendar fields in `timeZone`, so the window is local church time
 * whatever timezone the Worker runs in.
 */
export function zonedNow(now: Date, timeZone: string): ZonedNow | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(now);
  } catch {
    // Unknown/invalid IANA timezone name.
    return null;
  }

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const dayOfWeek = WEEKDAY_INDEX[lookup('weekday')];
  if (dayOfWeek === undefined) return null;

  return {
    minute: Number(lookup('minute')),
    hour: Number(lookup('hour')),
    dayOfMonth: Number(lookup('day')),
    month: Number(lookup('month')),
    dayOfWeek,
  };
}

/**
 * True when `now` in `timeZone` falls inside the window. Malformed expression
 * or unknown timezone returns false — fails closed, C-15.
 */
export function isWithinCronWindow(expression: string, now: Date, timeZone: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const zoned = zonedNow(now, timeZone);
  if (zoned === null) return false;

  // Sunday is 0 in our lookup; also accept 7 in the expression.
  const dowMatches =
    matchField(fields[4], zoned.dayOfWeek, FIELD_RANGES[4].min, FIELD_RANGES[4].max) ||
    (zoned.dayOfWeek === 0 && matchField(fields[4], 7, FIELD_RANGES[4].min, FIELD_RANGES[4].max));

  return (
    matchField(fields[0], zoned.minute, FIELD_RANGES[0].min, FIELD_RANGES[0].max) &&
    matchField(fields[1], zoned.hour, FIELD_RANGES[1].min, FIELD_RANGES[1].max) &&
    matchField(fields[2], zoned.dayOfMonth, FIELD_RANGES[2].min, FIELD_RANGES[2].max) &&
    matchField(fields[3], zoned.month, FIELD_RANGES[3].min, FIELD_RANGES[3].max) &&
    dowMatches
  );
}

/** Syntax check, so misconfiguration reports rather than silently never firing. */
export function isValidCronWindow(
  expression: string,
  timeZone: string,
  now = new Date(),
): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  if (zonedNow(now, timeZone) === null) return false;
  // A field that matches nothing in its range can never fire — almost always
  // a typo.
  return fields.every((field, i) => {
    const { min, max } = FIELD_RANGES[i];
    for (let v = min; v <= max; v += 1) if (matchField(field, v, min, max)) return true;
    return false;
  });
}
