import type { Lang } from './site';

/**
 * The members area shell (/members) and its 403 page. Board mail keeps its own
 * strings in boardCopy.ts; the CMS editors keep theirs in cmsCopy.ts.
 */
export type MembersCopy = {
  areaNav: string;
  tabMail: string;
  tabContent: string;
  mailIntro: string;
  contentIntro: string;
  contentNav: string;
  sectionEvents: string;
  sectionHeads: string;
  sectionPages: string;
  notConfigured: string;
  loadError: string;
  noAccessTitle: string;
  noAccessEyebrow: string;
  noAccessHeading: string;
  noAccessBody: string;
  noAccessOtherAccount: string;
};

export const membersCopy: Record<Lang, MembersCopy> = {
  af: {
    areaNav: 'Lede-area',
    tabMail: 'Kerkraadpos',
    tabContent: 'Webwerf-inhoud',
    mailIntro: 'Lees boodskappe van besoekers, en skryf as die kerk se amptelike adresse.',
    contentIntro: 'Werk by wat besoekers sien. Veranderinge gaan regstreeks wanneer jy Publiseer druk.',
    contentNav: 'Webwerf-inhoud',
    sectionEvents: 'Hierdie week',
    sectionHeads: 'Departementshoofde',
    sectionPages: 'Bladsye',
    notConfigured: 'Aanmelding is nog nie op hierdie weergawe van die webwerf opgestel nie.',
    loadError: 'Kon nie laai nie. Herlaai die bladsy en probeer weer.',
    noAccessTitle: 'Geen toegang · Tygerberg SDA Kerk',
    noAccessEyebrow: 'Net vir lede',
    noAccessHeading: 'Geen toegang',
    noAccessBody:
      'Hierdie Google-rekening is nie op die kerkraadlys nie. Vra ’n kerkraadslid om jou Google-adres by te voeg.',
    noAccessOtherAccount: 'Teken in met ’n ander rekening',
  },
  en: {
    areaNav: 'Members area',
    tabMail: 'Board mail',
    tabContent: 'Website content',
    mailIntro: 'Read messages from visitors, and write as the church’s official addresses.',
    contentIntro: 'Update what visitors see. Changes go live when you press Publish.',
    contentNav: 'Website content',
    sectionEvents: 'This week',
    sectionHeads: 'Department heads',
    sectionPages: 'Pages',
    notConfigured: 'Sign-in is not set up on this deployment of the site yet.',
    loadError: 'Could not load. Reload the page and try again.',
    noAccessTitle: 'No access · Tygerberg SDA Church',
    noAccessEyebrow: 'Members only',
    noAccessHeading: 'No access',
    noAccessBody:
      'This Google account is not on the board list. Ask a board member to add your Google address.',
    noAccessOtherAccount: 'Sign in with a different account',
  },
};
