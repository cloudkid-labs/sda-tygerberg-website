import type { Lang } from './site';

export type BloodBankCopy = {
  pageTitle: string;
  pageDescription: string;
  backHome: string;
  eyebrow: string;
  heading: string;
  sub: string;
  /** Shown above the slot list on each date. */
  slotsLabel: string;
  /** Composed with a count: "12 sessies". Singular gets its own noun because
   *  Afrikaans and English both change it, and "1 sessies" reads as a bug. */
  session: string;
  sessions: string;
  /** When the roster runs out. Better than a page insisting on nothing. */
  none: string;
  noneSub: string;
};

export const bloodBankCopy: Record<Lang, BloodBankCopy> = {
  af: {
    pageTitle: 'Bloedbank · Tygerberg SDA Kerk',
    pageDescription:
      'Bloedskenkdatums en tydgleuwe by Tygerberg SDA Kerk, Boston, Kaapstad. Gleuwe van 45 minute vanaf 13:00.',
    backHome: 'Terug na Tuisblad',
    eyebrow: 'Gee Bloed',
    heading: 'Bloedbank',
    sub: 'Die bloedbank kom gereeld by die kerk. Elke gleuf is 45 minute lank en begin op die uur — kom gerus by die een wat jou pas.',
    slotsLabel: 'Tydgleuwe',
    session: 'sessie',
    sessions: 'sessies',
    none: 'Geen datums op die rooster nie',
    noneSub: 'Die volgende jaar se datums is nog nie bevestig nie. Kontak ons gerus as jy wil weet wanneer die bloedbank weer kom.',
  },
  en: {
    pageTitle: 'Blood Bank · Tygerberg SDA Church',
    pageDescription:
      'Blood donation dates and time slots at Tygerberg SDA Church, Boston, Cape Town. 45-minute slots from 13:00.',
    backHome: 'Back to Homepage',
    eyebrow: 'Give Blood',
    heading: 'Blood Bank',
    sub: 'The blood bank visits the church regularly. Each slot runs 45 minutes and starts on the hour — come to whichever one suits you.',
    slotsLabel: 'Time slots',
    session: 'session',
    sessions: 'sessions',
    none: 'No dates on the roster',
    noneSub: 'Next year’s dates have not been confirmed yet. Get in touch if you would like to know when the blood bank next visits.',
  },
};
