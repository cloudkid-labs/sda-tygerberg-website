import type { Lang } from './site';

/**
 * The Sabbath-morning age groups, from the church's children's-ministry roster.
 *
 * The roster is a duty list: it names a leader and one to three assistants per
 * group. **None of those names are here, and none belong on the page.** /youth
 * answers a parent's question — "is there something for my eight-year-old, and
 * when" — and a staff directory answers a different one. The office holders are
 * already on the home page's carousel (`departmentHeads.ts`), which is where a
 * visitor looking for a person is sent. See CONCERNS.md C-38.
 *
 * Ages are numbers rather than "4-6" strings so the band renders once, in one
 * format, on whatever page asks for it (C-03).
 */
export type YouthGroup = {
  id: string;
  /** Inclusive, in years. `[0, 3]` is "from birth up to and including three". */
  ages: readonly [number, number];
  /** The church's own name for the group, not a translation of the age band. */
  name: Record<Lang, string>;
  /**
   * One line on what the group does. Drafted here, **not confirmed by the
   * board** — the same standard `homeCopy.firstVisit` holds itself to. A group
   * with an empty blurb renders as a name and an age band, so emptying one is
   * how you retract a description you are not sure of, rather than deleting the
   * group and losing the age band with it.
   */
  blurb: Record<Lang, string>;
};

export const SABBATH_YOUTH_GROUPS: YouthGroup[] = [
  {
    id: 'beginners',
    ages: [0, 3],
    name: { af: 'Beginnerklas', en: 'Beginners' },
    blurb: {
      af: 'Die heel kleinstes, in ’n rustige klas van hul eie.',
      en: 'The very youngest, in a quiet class of their own.',
    },
  },
  {
    id: 'kindergarten',
    ages: [4, 6],
    name: { af: 'Kindertuin', en: 'Kindergarten' },
    blurb: {
      af: 'Liedjies, Bybelverhale en beweging vir voorskoolse kinders.',
      en: 'Songs, Bible stories and movement for preschoolers.',
    },
  },
  {
    id: 'primary',
    ages: [7, 9],
    name: { af: 'Primêre', en: 'Primary' },
    blurb: {
      af: 'Bybelverhale en aktiwiteite vir laerskoolkinders.',
      en: 'Bible stories and activities for primary-school children.',
    },
  },
  {
    id: 'juniors',
    ages: [10, 12],
    name: { af: 'Juniors', en: 'Juniors' },
    blurb: {
      af: 'Lesstudie en gesprek vir pre-tieners.',
      en: 'Lesson study and conversation for pre-teens.',
    },
  },
  {
    id: 'teens',
    ages: [13, 18],
    name: { af: 'Tieners', en: 'Teens' },
    blurb: {
      af: 'Gesprek, vrae en lesstudie vir hoërskoolleerders.',
      en: 'Discussion, questions and lesson study for high-schoolers.',
    },
  },
];

/** "4 – 6", matching how every other range on the site is punctuated. */
export const ageRange = (group: YouthGroup) => `${group.ages[0]} – ${group.ages[1]}`;

/**
 * When the groups run. The children join the congregation at 11:00 for the
 * Divine Service, so this ends where `SERVICE_TIMES` starts its third entry —
 * deliberately not derived from it, because "the groups end when the sermon
 * starts" is a coincidence of the current timetable and not a rule.
 *
 * Restated in prose by `homeCopy.firstVisit` and by `public/llms.txt`, neither
 * of which can import it. Change it here and change it there too — C-35.
 */
export const SABBATH_GROUPS = { start: '09:30', end: '11:00' } as const;

/**
 * The Friday evening. Owned here rather than in `homeCopy.week` because the
 * week grid and /youth both print it, and the grid's card is the link to the
 * page — a card promising 19:00 in front of a page saying 19:30 is the exact
 * failure C-03 is about.
 */
export const YOUTH_EVENING = {
  day: { af: 'Vrydag', en: 'Friday' },
  start: '19:00',
  end: '21:00',
} as const;

export const sabbathGroupsRange = `${SABBATH_GROUPS.start} – ${SABBATH_GROUPS.end}`;
export const youthEveningRange = `${YOUTH_EVENING.start} – ${YOUTH_EVENING.end}`;
