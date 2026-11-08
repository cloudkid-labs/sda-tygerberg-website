import type { Lang } from './site';
import { DIVINE_SERVICE } from './site';
import { SABBATH_GROUPS, YOUTH_EVENING, youthEveningRange } from './youthGroups';

/*
 * The midweek clock times, once. A clock time is not language-specific, and
 * typing it into both the Afrikaans and the English literal is how the two
 * halves of a bilingual file drift apart — the Jeugaand entry three lines below
 * each of them already imports its range instead of retyping it. C-53
 */
const MIDWEEK = {
  prayer: '19:00 – 20:00',
  counselling: '13:00 – 16:00',
  bibleStudy: '19:00 – 21:00',
  volleyball: '19:00 – 21:00',
} as const;

/**
 * One midweek card. `href` turns the card into a link to the page behind it and
 * `more` is the label that says so — both absent on an entry that is only ever
 * a card, which is most of them. `place` names where it happens, because the
 * grid's heading promises "by die kerk" while some entries are not there.
 */
export type WeekEntry = {
  day: string;
  name: string;
  time: string;
  place?: string;
  href?: string;
  more?: string;
};

/** A practical question a first-time visitor has, and its answer. */
export type FirstVisitEntry = {
  id: 'parking' | 'children' | 'accessibility' | 'dress' | 'language';
  q: string;
  a: string;
};

export type HomeCopy = {
  navAbout: string;
  navBeliefs: string;
  navMinistries: string;
  navEvents: string;
  eventsHeading: string;
  eventsSub: string;
  eventsEmpty: string;
  eventsMore: string;
  navVisit: string;
  navConnect: string;
  navResources: string;
  navLogin: string;
  give: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSub: string;
  ctaVisit: string;
  ctaWatch: string;
  liveLabel: string;
  watchCardTitle: string;
  watchCardHint: string;
  tabReplay: string;
  timesLabel: string;
  week: WeekEntry[];
  weekHeading: string;
  weekSub: string;
  /** The week grid's fifth card. Everything else the card needs — the next
   *  date and the session count — is derived, and the page it links to keeps
   *  its own copy in `bloodBankCopy.ts`. */
  bloodBankName: string;
  /**
   * Answered by the board. The section hides itself while this is empty, so
   * emptying it unpublishes the section rather than leaving a bare heading.
   * Only publish what the church has actually confirmed — a wrong answer about
   * wheelchair access or parking is worse than no answer.
   */
  firstVisit: FirstVisitEntry[];
  firstVisitHeading: string;
  firstVisitSub: string;
  aboutHeading: string;
  aboutSub: string;
  carouselLabel: string;
  carouselPrev: string;
  carouselNext: string;
  carouselPause: string;
  carouselPlay: string;
  /** Short visible button text; the full string above is the accessible name. */
  carouselPauseShort: string;
  carouselPlayShort: string;
  carouselOf: string;
  beliefsHeading: string;
  beliefsSub: string;
  beliefRead: string;
  involvedHeading: string;
  connectTitle: string;
  connectDesc: string;
  studyTitle: string;
  studyDesc: string;
  giveTitle: string;
  giveDesc: string;
  giveCta: string;
  connectCta: string;
  studyCta: string;
  resourcesHeading: string;
  resourcesSub: string;
  visitEyebrow: string;
  visitHeading: string;
  visitAddressLabel: string;
  copyAddress: string;
  addressCopied: string;
  addressCopyFailed: string;
  /** Day prefix on the service-times rows. "Sa" in Afrikaans, "Sat" in English. */
  saturdayShort: string;
  mapTitle: string;
  directionsCta: string;
  appleMapsCta: string;
  footerBlurb: string;
  footerVisit: string;
  footerTimesLabel: string;
  /** Label above the social pills in the footer's "Besoek ons" column. */
  followUs: string;
  /** Screen-reader suffix on links that open a new tab. */
  opensNewTab: string;
  footerCreditBuilder: string;
  footerCreditChurch: string;
};

export const homeCopy: Record<Lang, HomeCopy> = {
  af: {
    navAbout: 'Oor Ons',
    navBeliefs: 'Wat Ons Glo',
    navMinistries: 'Hierdie Week',
    navEvents: 'Geleenthede',
    eventsHeading: 'Geleenthede',
    eventsSub: 'Kampe, konferensies en spesiale dae — besonderhede op elke bladsy.',
    eventsEmpty: 'Daar is tans geen komende geleenthede nie. Kyk binnekort weer.',
    eventsMore: 'Lees meer',
    navVisit: 'Besoek',
    navConnect: 'Verbind',
    navResources: 'Hulpbronne',
    navLogin: 'Teken in',
    give: 'Skenk',
    heroEyebrow: 'Sewendedag Adventiste Kerk · Tygerberg',
    heroTitle: 'Vind rus, hoop en genesing in Jesus',
    heroSub:
      'Sluit elke Sabbat by ons aan in Boston, Kaapstad — of kyk lewendig van waar jy ook al is.',
    ctaVisit: 'Besoek ons gemeente',
    ctaWatch: 'Kyk Lewendig',
    liveLabel: 'LEWENDIG',
    watchCardTitle: 'Kyk ons jongste diens',
    watchCardHint: 'Maak op YouTube oop',
    tabReplay: 'Onlangse Dienste',
    timesLabel: 'Sabbatdienste',
    week: [
      { day: 'Dinsdag', name: 'Biduur', time: MIDWEEK.prayer, place: 'By die kerk' },
      {
        day: 'Woensdag',
        name: 'Pastorale Berading',
        time: MIDWEEK.counselling,
        place: 'By die kerk · 45 min-sessies op die uur',
      },
      { day: 'Woensdag', name: 'Bybelstudie', time: MIDWEEK.bibleStudy, place: 'By die kerk' },
      { day: 'Donderdag', name: 'Vlugbal', time: MIDWEEK.volleyball, place: 'In die kerksaal' },
      // Day and time come from youthGroups.ts because /youth prints them too,
      // and this card is the link to that page — C-03. The place stays a
      // short card label; the full venue sentence lives on the page itself.
      {
        day: YOUTH_EVENING.day.af,
        name: 'Junior-jeugaand',
        time: youthEveningRange,
        place: 'Wisselende huise',
        href: '/youth/',
        more: 'Sien meer',
      },
    ],
    weekHeading: 'Hierdie week by die kerk',
    weekSub: 'Almal welkom — bring gerus ’n vriend saam.',
    bloodBankName: 'Bloedbank',
    firstVisit: [
      {
        id: 'parking',
        q: 'Waar parkeer ek?',
        a: 'Daar is beveiligde parkering op die perseel, maar dit is beperk. Kom gerus ’n bietjie vroeër as jy seker wil wees van ’n plek.',
      },
      {
        id: 'children',
        q: 'Is daar iets vir die kinders?',
        a: `Ja — kinderprogramme loop van ${SABBATH_GROUPS.start} tot ${SABBATH_GROUPS.end}, terwyl Sabbatskool en Lesstudie aan die gang is. Daarna sluit die kinders by die gemeente aan vir die ${DIVINE_SERVICE.af}.`,
      },
      {
        id: 'accessibility',
        q: 'Is die gebou rolstoeltoeganklik?',
        a: 'Ja, die gebou is rolstoeltoeganklik.',
      },
      {
        id: 'dress',
        q: 'Wat trek mense aan?',
        a: 'Formeel tot semi-formeel — kerkdrag. Jy sal nie uit plek voel in ’n baadjie of ’n rok nie.',
      },
      {
        id: 'language',
        q: 'In watter taal is die diens?',
        a: 'Hoofsaaklik Afrikaans, met Engels van tyd tot tyd. Daar is nie tolkdienste beskikbaar nie.',
      },
    ],
    firstVisitHeading: 'Jou eerste besoek',
    firstVisitSub: 'Wat om te verwag wanneer jy die eerste keer by ons aansluit.',
    aboutHeading: 'Ontmoet ons departementshoofde',
    aboutSub: 'Die mense wat ons gemeente se bedieninge lei.',
    carouselLabel: 'Departementshoofde',
    carouselPrev: 'Vorige departementshoof',
    carouselNext: 'Volgende departementshoof',
    carouselPause: 'Stop outomatiese blaai',
    carouselPlay: 'Begin outomatiese blaai',
    carouselPauseShort: 'Stop',
    carouselPlayShort: 'Speel',
    carouselOf: 'van',
    beliefsHeading: 'Wat ons glo',
    beliefsSub: 'Die 28 fundamentele leerstellings, gegroepeer in ses temas wat ons geloof in Jesus vorm.',
    beliefRead: 'Lees al 28 leerstellings →',
    involvedHeading: 'Raak betrokke',
    connectTitle: 'Verbind',
    connectDesc: "Kry 'n antwoord op jou vrae — ons stel jou aan die regte persoon voor.",
    studyTitle: 'Bybelstudies',
    studyDesc: "Vra 'n gratis Bybel- of doopstudie by jou tuiste aan.",
    giveTitle: 'Skenk',
    giveDesc: 'Ondersteun die bediening met jou tiendes en gawes via EFT.',
    giveCta: 'Bankbesonderhede',
    connectCta: 'Kontak ons',
    studyCta: 'Vra studie aan',
    resourcesHeading: 'Voed jou geloof daagliks',
    resourcesSub: 'Amptelike Adventiste hulpbronne vir studie en aanbidding.',
    visitEyebrow: 'Besoek Ons',
    visitHeading: 'Sluit by ons aan hierdie Sabbat',
    visitAddressLabel: 'Adres',
    copyAddress: 'Kopieer Adres',
    addressCopied: 'Gekopieer!',
    addressCopyFailed: 'Kon nie kopieer nie',
    saturdayShort: 'Sa',
    mapTitle: 'Tygerberg SDA Kerk — kaart',
    directionsCta: 'Kry Aanwysings',
    appleMapsCta: 'Maak oop in Apple Maps',
    footerBlurb: '’n Gemeente wat hoop, genesing en die liefde van Jesus met die Tygerberg-omgewing deel.',
    footerVisit: 'Besoek ons',
    footerTimesLabel: 'Dienstye',
    followUs: 'Volg ons',
    opensNewTab: '(maak in ’n nuwe oortjie oop)',
    footerCreditBuilder: 'Geskep deur CK Labs ™',
    footerCreditChurch: 'Deel van die wêreldwye Adventistekerk · adventist.org',
  },
  en: {
    navAbout: 'About',
    navBeliefs: 'Beliefs',
    navMinistries: 'This Week',
    navEvents: 'Events',
    eventsHeading: 'Events',
    eventsSub: 'Camps, conferences and special days — details on each page.',
    eventsEmpty: 'There are no upcoming events right now. Check back soon.',
    eventsMore: 'Read more',
    navVisit: 'Visit',
    navConnect: 'Connect',
    navResources: 'Resources',
    navLogin: 'Sign in',
    give: 'Give',
    heroEyebrow: 'Seventh-day Adventist Church · Tygerberg',
    heroTitle: 'Find rest, hope and healing in Jesus',
    heroSub: 'Join us every Sabbath in Boston, Cape Town — or watch live from wherever you are.',
    ctaVisit: 'Visit our church',
    ctaWatch: 'Watch Live',
    liveLabel: 'LIVE',
    watchCardTitle: 'Watch our latest service',
    watchCardHint: 'Opens on YouTube',
    tabReplay: 'Recent Services',
    timesLabel: 'Sabbath Services',
    week: [
      { day: 'Tuesday', name: 'Prayer Meeting', time: MIDWEEK.prayer, place: 'At the church' },
      {
        day: 'Wednesday',
        name: 'Pastoral Counselling',
        time: MIDWEEK.counselling,
        place: 'At the church · 45-min sessions on the hour',
      },
      { day: 'Wednesday', name: 'Bible Study', time: MIDWEEK.bibleStudy, place: 'At the church' },
      { day: 'Thursday', name: 'Volleyball', time: MIDWEEK.volleyball, place: 'In the church hall' },
      {
        day: YOUTH_EVENING.day.en,
        name: 'Junior Youth Evening',
        time: youthEveningRange,
        place: 'Rotating homes',
        href: '/youth/',
        more: 'See more',
      },
    ],
    weekHeading: 'This week at church',
    weekSub: 'Everyone welcome — feel free to bring a friend.',
    bloodBankName: 'Blood Bank',
    firstVisit: [
      {
        id: 'parking',
        q: 'Where do I park?',
        a: 'There is secured parking on the premises, but it is limited. Arrive a little early if you want to be sure of a bay.',
      },
      {
        id: 'children',
        q: 'Is there anything for the children?',
        a: `Yes — children’s programmes run from ${SABBATH_GROUPS.start} to ${SABBATH_GROUPS.end}, while Sabbath School and Lesson Study are on. The children then join the congregation for the ${DIVINE_SERVICE.en}.`,
      },
      {
        id: 'accessibility',
        q: 'Is the building wheelchair accessible?',
        a: 'Yes, the building is wheelchair accessible.',
      },
      {
        id: 'dress',
        q: 'What do people wear?',
        a: 'Formal to semi-formal — church attire. You will not feel out of place in a jacket or a dress.',
      },
      {
        id: 'language',
        q: 'What language is the service in?',
        a: 'Primarily Afrikaans, with English from time to time. Translation is not available.',
      },
    ],
    firstVisitHeading: 'Your first visit',
    firstVisitSub: 'What to expect the first time you join us.',
    aboutHeading: 'Meet our department heads',
    aboutSub: 'The people who lead our church ministries.',
    carouselLabel: 'Department heads',
    carouselPrev: 'Previous department head',
    carouselNext: 'Next department head',
    carouselPause: 'Pause automatic scrolling',
    carouselPlay: 'Resume automatic scrolling',
    carouselPauseShort: 'Pause',
    carouselPlayShort: 'Play',
    carouselOf: 'of',
    beliefsHeading: 'What we believe',
    beliefsSub: 'The 28 fundamental beliefs, grouped into six themes that shape our faith in Jesus.',
    beliefRead: 'Read all 28 beliefs →',
    involvedHeading: 'Get involved',
    connectTitle: 'Connect',
    connectDesc: 'Get an answer to your questions — we’ll introduce you to the right person.',
    studyTitle: 'Bible Studies',
    studyDesc: 'Request a free Bible study or baptismal study in your home.',
    giveTitle: 'Give',
    giveDesc: 'Support the ministry with your tithe and offerings via EFT.',
    giveCta: 'Banking details',
    connectCta: 'Contact us',
    studyCta: 'Request study',
    resourcesHeading: 'Feed your faith daily',
    resourcesSub: 'Official Adventist resources for study and worship.',
    visitEyebrow: 'Visit Us',
    visitHeading: 'Join us this Sabbath',
    visitAddressLabel: 'Address',
    copyAddress: 'Copy Address',
    addressCopied: 'Copied!',
    addressCopyFailed: 'Copy failed',
    saturdayShort: 'Sat',
    mapTitle: 'Tygerberg SDA Church — map',
    directionsCta: 'Get Directions',
    appleMapsCta: 'Open in Apple Maps',
    footerBlurb: 'A congregation sharing hope, healing and the love of Jesus with the Tygerberg community.',
    footerVisit: 'Visit us',
    footerTimesLabel: 'Service times',
    followUs: 'Follow us',
    opensNewTab: '(opens in a new tab)',
    footerCreditBuilder: 'Created & Maintained by CK Labs ™',
    footerCreditChurch: 'Part of the worldwide Adventist Church · adventist.org',
  },
};
