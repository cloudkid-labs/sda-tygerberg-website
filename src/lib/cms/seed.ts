import { homeCopy, type WeekEntry } from '../../data/homeCopy';
import { departmentHeads } from '../../data/departmentHeads';
import { WEEKDAYS_AF, type ChurchEvent, type DepartmentHead, type Page, type WeekdayAf } from './types';

/**
 * What the CMS holds before anyone has saved anything: the homepage exactly as
 * it was hand-coded, read from the same source files rather than retyped, so
 * the first render after the switch is identical to the last one before it.
 *
 * The seed is never written back to src/data; once a board member saves, R2 is
 * the source and this is only the fallback for an unbound or empty bucket.
 */

export const SEED_BY = 'seed';
export const SEED_AT = '2026-10-31T00:00:00.000Z';

/** "Pastorale Berading" → "pastorale-berading". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitRange(range: string): { start: string; end: string } {
  const m = /^(\d{2}:\d{2})\s*–\s*(\d{2}:\d{2})$/.exec(range);
  if (!m) throw new Error(`seed: unreadable time range "${range}"`);
  return { start: m[1], end: m[2] };
}

function isWeekday(day: string): day is WeekdayAf {
  return (WEEKDAYS_AF as readonly string[]).includes(day);
}

/** The homepage week cards, AF and EN zipped by position. */
export function seedEvents(): ChurchEvent[] {
  const af = homeCopy.af.week;
  const en = homeCopy.en.week;
  if (af.length !== en.length) throw new Error('seed: homeCopy week lists differ in length');
  return af.map((a: WeekEntry, i) => {
    const e = en[i];
    if (!isWeekday(a.day)) throw new Error(`seed: "${a.day}" is not a weekday`);
    const { start, end } = splitRange(a.time);
    const event: ChurchEvent = {
      id: slugify(a.name),
      kind: 'weekly',
      day: a.day,
      start,
      end,
      name: { af: a.name, en: e.name },
      where: { af: a.place ?? '', en: e.place ?? '' },
      order: i,
      status: 'live',
      updatedBy: SEED_BY,
      updatedAt: SEED_AT,
    };
    if (a.href) {
      event.link = {
        pageSlug: a.href.replace(/^\/|\/$/g, ''),
        label: { af: a.more ?? '', en: e.more ?? '' },
      };
    }
    return event;
  });
}

/**
 * Every roster entry, photographed or not (C-29 keeps the roster complete).
 * A head shows on the site when visible and photographed — the same 14 the
 * carousel shows today.
 */
export function seedHeads(): DepartmentHead[] {
  return departmentHeads.map((head, i) => ({
    id: head.id,
    name: head.name,
    positions: head.roles.af.map((af, j) => ({ af, en: head.roles.en[j] ?? '' })),
    ...(head.photo ? { photo: { src: `/images/hod/${head.photo}`, alt: head.name } } : {}),
    visible: head.active !== false && Boolean(head.photo),
    order: i,
    updatedBy: SEED_BY,
    updatedAt: SEED_AT,
  }));
}

/** 45-minute sessions on the hour, inside [start, end). */
function hourlySlots(start: string, end: string): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out: string[] = [];
  for (let m = toMin(start); m + 45 <= toMin(end); m += 60) out.push(`${fmt(m)} – ${fmt(m + 45)}`);
  return out;
}

/**
 * The first real page: a draft, never public until a board member publishes
 * it. Day and hours come from the seeded event; the pastor's name from the
 * roster. The booking method is not known and is not invented.
 */
export function seedPages(): Page[] {
  const counselling = seedEvents().find((e) => e.id === 'pastorale-berading');
  const pastor = departmentHeads.find((h) => h.id === 'kerkraad');
  if (!counselling || !pastor) throw new Error('seed: counselling event or pastor missing');
  const { start, end } = counselling;
  return [
    {
      slug: 'pastoral-counselling',
      title: { af: counselling.name.af, en: counselling.name.en },
      eyebrow: { af: 'Pastorale sorg', en: 'Pastoral care' },
      intro: {
        af: `${pastor.name} bied pastorale berading by die kerk aan. Sessies is 45 minute lank en begin op die uur.`,
        // TODO(review): EN rendering of "Lr." is new copy.
        en: `Pastor Arnold Neuhoff offers pastoral counselling at the church. Sessions are 45 minutes long and start on the hour.`,
      },
      blocks: [
        {
          type: 'infoCard',
          label: { af: 'Elke Woensdag', en: 'Every Wednesday' },
          big: { af: `${start} – ${end}`, en: `${start} – ${end}` },
          where: { af: 'By die kerk', en: 'At the church' },
          note: { af: `Met ${pastor.name}`, en: 'With Pastor Arnold Neuhoff' },
        },
        {
          type: 'timeSlots',
          day: { af: 'Woensdag', en: 'Wednesday' },
          title: { af: '45 min-sessies op die uur', en: '45-min sessions on the hour' },
          slots: hourlySlots(start, end),
        },
        {
          type: 'callout',
          heading: { af: 'Wil jy ’n sessie bespreek?', en: 'Would you like to book a session?' },
          // TODO(board): booking method for pastoral counselling — not in any
          // source. Placeholder until the board confirms; never invented.
          text: {
            af: '[TODO: bespreekmetode — wag op bevestiging van die kerkraad]',
            en: '[TODO: booking method — awaiting confirmation from the board]',
          },
          button: { label: { af: 'Kontak ons', en: 'Contact us' }, href: '/connect/' },
        },
      ],
      status: 'draft',
      updatedBy: SEED_BY,
      updatedAt: SEED_AT,
    },
  ];
}
