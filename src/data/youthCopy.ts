import type { Lang } from './site';
import { YOUTH_AGE_SPAN, YOUTH_EVENING, youthEveningRange } from './youthGroups';

/**
 * Copy for /youth. Written for a parent deciding whether to bring a child, and
 * for a teenager deciding whether to come on a Friday — not for the board.
 * Nothing here names a volunteer; CONCERNS.md C-38 says why.
 */
export type YouthCopy = {
  pageTitle: string;
  pageDescription: string;
  backHome: string;
  eyebrow: string;
  heading: string;
  sub: string;
  /** Composed with the weekday: "Elke Vrydag". */
  everyPrefix: string;
  whereLabel: string;
  /** Nothing on this site takes a booking — C-37 — and a parent should not
   *  have to guess whether this page is the exception. */
  noBooking: string;
  sabbathHeading: string;
  sabbathSub: string;
  groupsLabel: string;
  /** Follows the age band: "4 – 6 jaar". */
  yearsLabel: string;
  afterLabel: string;
  afterNote: string;
  ctaHeading: string;
  ctaBody: string;
  ctaLabel: string;
};

export const youthCopy: Record<Lang, YouthCopy> = {
  af: {
    pageTitle: 'Jeugaand · Tygerberg SDA Kerk',
    pageDescription: `Junior-jeugaand elke ${YOUTH_EVENING.day.af} ${youthEveningRange} by wisselende huise, en Sabbatoggendklasse vir elke ouderdom van ${YOUTH_AGE_SPAN.youngest} tot ${YOUTH_AGE_SPAN.oldest}, by Tygerberg SDA Kerk, Boston, Kaapstad.`,
    backHome: 'Terug na Tuisblad',
    eyebrow: 'Junior jeug',
    heading: 'Jeugaand',
    sub: 'Vrydagaande kom die junior jeug bymekaar — nie by die kerk nie, maar by tieners se huise, en die plek wissel elke week. Op die Sabbat is daar ’n klas vir elke ouderdom — van baba tot matriek.',
    everyPrefix: 'Elke',
    whereLabel: 'Waar',
    noBooking: 'Niks om te bespreek nie — vra ons net waar.',
    sabbathHeading: 'Op die Sabbat',
    sabbathSub:
      'Terwyl Sabbatskool en Lesstudie aan die gang is, is die kinders en tieners in hul eie klasse. Elke groep het sy eie leier.',
    groupsLabel: 'Sabbatskool tye',
    yearsLabel: 'jaar',
    afterLabel: 'Daarna',
    afterNote: 'Die kinders sluit by die gemeente aan vir die',
    ctaHeading: 'Nog ’n vraag?',
    ctaBody:
      'Vra gerus vooraf — oor die groepe, die tye, of wat om die eerste keer saam te bring. Ons stel jou aan die regte persoon voor.',
    ctaLabel: 'Kontak ons',
  },
  en: {
    pageTitle: 'Youth Evening · Tygerberg SDA Church',
    pageDescription: `Junior Youth Evening every ${YOUTH_EVENING.day.en} ${youthEveningRange} at rotating homes, and Sabbath morning classes for every age from ${YOUTH_AGE_SPAN.youngest} to ${YOUTH_AGE_SPAN.oldest}, at Tygerberg SDA Church, Boston, Cape Town.`,
    backHome: 'Back to Homepage',
    eyebrow: 'Junior youth',
    heading: 'Youth Evening',
    sub: 'On Friday evenings the junior youth get together — not at the church, but at teens’ homes, with the venue changing every week. On the Sabbath there is a class for every age — from babies to school-leavers.',
    everyPrefix: 'Every',
    whereLabel: 'Where',
    noBooking: 'Nothing to book — just ask us where.',
    sabbathHeading: 'On the Sabbath',
    sabbathSub:
      'While Sabbath School and Lesson Study are on, the children and teenagers are in classes of their own. Every group has its own leader.',
    groupsLabel: 'Sabbath School times',
    yearsLabel: 'years',
    afterLabel: 'Afterwards',
    afterNote: 'The children join the congregation for the',
    ctaHeading: 'Still have a question?',
    ctaBody:
      'Ask before you come — about the groups, the times, or what to bring the first time. We’ll introduce you to the right person.',
    ctaLabel: 'Contact us',
  },
};
