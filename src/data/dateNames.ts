import type { Lang } from './site';

/**
 * Month and weekday names, in both languages.
 *
 * Not `toLocaleDateString`. That needs an `af-ZA` the browser may not carry,
 * and when it is missing there is no error — it falls back to English month
 * names on an Afrikaans-first page, which is the kind of wrong nobody reports.
 *
 * These live here rather than in a page's copy file because more than one page
 * formats a date, and a second copy of "Desember" is a second chance to get it
 * wrong (C-03).
 */
export const MONTHS: Record<Lang, readonly string[]> = {
  af: [
    'Januarie',
    'Februarie',
    'Maart',
    'April',
    'Mei',
    'Junie',
    'Julie',
    'Augustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

/** Sunday-first, matching `Date#getDay()`. */
export const WEEKDAYS: Record<Lang, readonly string[]> = {
  af: ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/**
 * Parses `YYYY-MM-DD` as a *local* date. `new Date('2026-09-10')` is parsed as
 * UTC midnight, which in any negative-offset timezone is the previous day once
 * `getDay()` reads it locally — a visitor in New York would be told the drive
 * falls on a Wednesday.
 */
function parseLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "10 September 2026" */
export function formatDate(iso: string, lang: Lang): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[lang][month - 1]} ${year}`;
}

/** "Donderdag" — derived from the date rather than stored beside it, so the
 *  two can never contradict each other. */
export function weekdayOf(iso: string, lang: Lang): string {
  return WEEKDAYS[lang][parseLocal(iso).getDay()];
}
