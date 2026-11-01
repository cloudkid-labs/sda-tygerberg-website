import type { Lang } from './site';

/**
 * The members area shell (/members) and its 403 page. Board mail keeps its own
 * strings in boardCopy.ts; the CMS editors keep theirs in cmsCopy.ts.
 */
export type MembersCopy = {
  areaNav: string;
  tabMail: string;
  tabContent: string;
  tabTestSite: string;
  testHeading: string;
  testIntro: string;
  testPoints: string[];
  testRecommend: string;
  testSignIn: string;
  testSignInNote: string;
  onTestHeading: string;
  onTestIntro: string;
  onTestLive: string;
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
    tabTestSite: 'Toetswerf',
    testHeading: 'Probeer eers op die toetswerf',
    testIntro: 'Die toetswerf is ’n volledige kopie van die webwerf met sy eie lede-area. Hier kan jy veilig oefen en nuwe dinge probeer.',
    testPoints: [
      'Voeg geleenthede, bladsye en foto’s by, wysig en publiseer soos op die regte webwerf.',
      'Besoekers sien niks daarvan nie: die toetswerf is van soekenjins af weggesteek en raak nie die regte webwerf nie.',
      'Kerkraadpos stuur van daar af geen e-pos nie.',
      'Wat jy daar doen, word nie oorgedra nie. Doen dit weer hier sodra jy tevrede is.',
    ],
    testRecommend: 'Ons beveel aan dat jy enigiets nuuts eers op die toetswerf probeer voordat jy dit hier publiseer.',
    testSignIn: 'Teken in op die toetswerf',
    testSignInNote: 'Gebruik dieselfde Google-rekening. Jy bly ook hier aangemeld.',
    onTestHeading: 'Jy is op die toetswerf',
    onTestIntro: 'Niks wat jy hier doen, raak die regte webwerf of sy besoekers nie. Wanneer jy tevrede is, doen dieselfde op die regte webwerf.',
    onTestLive: 'Gaan na die regte webwerf',
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
    tabTestSite: 'Test site',
    testHeading: 'Try it on the test site first',
    testIntro: 'The test site is a full copy of the website with its own members area. It is where you can practise and try new things safely.',
    testPoints: [
      'Add, edit and publish events, pages and photos exactly as on the real site.',
      'Visitors never see any of it: the test site is hidden from search engines and does not touch the real site.',
      'Board mail sends no email from there.',
      'Nothing you do there is copied across. Do it again here once you are happy with it.',
    ],
    testRecommend: 'We recommend trying anything new on the test site before you publish it here.',
    testSignIn: 'Sign in to the test site',
    testSignInNote: 'Use the same Google account. You stay signed in here too.',
    onTestHeading: 'You are on the test site',
    onTestIntro: 'Nothing you do here touches the real website or its visitors. Once you are happy, do the same on the real site.',
    onTestLive: 'Go to the real site',
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
