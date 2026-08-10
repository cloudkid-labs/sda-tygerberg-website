import type { Lang } from './site';

export type WeekEntry = { day: string; name: string; time: string };

/** A practical question a first-time visitor has, and its answer. */
export type FirstVisitEntry = { q: string; a: string };

export type HomeCopy = {
  navAbout: string;
  navBeliefs: string;
  navMinistries: string;
  navVisit: string;
  navConnect: string;
  navResources: string;
  navDirections: string;
  give: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSub: string;
  ctaVisit: string;
  ctaWatch: string;
  liveLabel: string;
  tabReplay: string;
  timesLabel: string;
  week: WeekEntry[];
  weekHeading: string;
  weekSub: string;
  /** January-first, indexed by `Date#getMonth()`. Rendering `BLOOD_DRIVES`
   *  formats dates from these rather than `toLocaleDateString`, which needs an
   *  `af-ZA` the browser may not carry and would quietly fall back to English
   *  month names on an Afrikaans-first page. */
  months: string[];
  bloodBankName: string;
  /** The roster says only "Toesluit is 19h30" — a closing time, no start. */
  bloodBankTime: string;
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
  beliefTitles: string[];
  beliefDescs: string[];
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
  resLesson: string;
  resHomebase: string;
  resAwr: string;
  visitEyebrow: string;
  visitHeading: string;
  visitAddressLabel: string;
  copyAddress: string;
  addressCopied: string;
  directionsCta: string;
  appleMapsCta: string;
  footerBlurb: string;
  footerVisit: string;
  footerTimesLabel: string;
};

export const homeCopy: Record<Lang, HomeCopy> = {
  af: {
    navAbout: 'Oor Ons',
    navBeliefs: 'Wat Ons Glo',
    navMinistries: 'Hierdie Week',
    navVisit: 'Besoek',
    navConnect: 'Verbind',
    navResources: 'Hulpbronne',
    navDirections: 'Aanwysings',
    give: 'Skenk',
    heroEyebrow: 'Sewendedag Adventiste Kerk · Tygerberg',
    heroTitle: 'Vind rus, hoop en genesing in Jesus',
    heroSub:
      'Sluit elke Sabbat by ons aan in Boston, Kaapstad — of kyk lewendig van waar jy ook al is.',
    ctaVisit: 'Besoek ons gemeente',
    ctaWatch: 'Kyk Lewendig',
    liveLabel: 'LEWENDIG',
    tabReplay: 'Onlangse Dienste',
    timesLabel: 'Sabbatdienste',
    week: [
      { day: 'Dinsdag', name: 'Biduur', time: '19:00 – 20:00' },
      { day: 'Woensdag', name: 'Bybelstudie', time: '19:00 – 21:00' },
      { day: 'Donderdag', name: 'Vlugbal', time: '19:00 – 21:00' },
      { day: 'Vrydag', name: 'Junior Jeug', time: '19:00 – 21:00' },
    ],
    weekHeading: 'Hierdie week by die kerk',
    weekSub: 'Almal welkom — bring gerus ’n vriend saam.',
    months: [
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
    bloodBankName: 'Bloedbank',
    bloodBankTime: 'Sluit 19:30',
    firstVisit: [
      {
        q: 'Waar parkeer ek?',
        a: 'Daar is beveiligde parkering op die perseel, maar dit is beperk. Kom gerus ’n bietjie vroeër as jy seker wil wees van ’n plek.',
      },
      {
        q: 'Is daar iets vir die kinders?',
        a: 'Ja — kinderprogramme loop van 09:30 tot 11:00, terwyl Sabbatskool en Lesstudie aan die gang is. Daarna sluit die kinders by die gemeente aan vir die Goddelike Diens.',
      },
      {
        q: 'Is die gebou rolstoeltoeganklik?',
        a: 'Ja, die gebou is rolstoeltoeganklik.',
      },
      {
        q: 'Wat trek mense aan?',
        a: 'Formeel tot semi-formeel — kerkdrag. Jy sal nie uit plek voel in ’n baadjie of ’n rok nie.',
      },
      {
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
    beliefTitles: ['God', 'Mensdom', 'Verlossing', 'Die Kerk', 'Daaglikse Lewe', 'Herstel'],
    beliefDescs: [
      'Die Skrif as die Woord van God, die Drie-eenheid, en die karakter van die Vader, Seun en Heilige Gees.',
      'Die skepping en die aard van die mens, geskape na die beeld van God.',
      'Die groot stryd, die lewe, dood en opstanding van Christus, en die ervaring van verlossing.',
      'Die kerk en haar sending, eenheid in die liggaam, die doop en die Nagmaal.',
      'Die Sabbat, rentmeesterskap, die gawe van profesie, die gesin en Christelike lewe.',
      'Christus se diens in die hemelse heiligdom, sy wederkoms, die opstanding en die nuwe aarde.',
    ],
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
    resLesson: 'Lesstudie Biblioteek',
    resHomebase: 'HomebaseTV Afrikaans',
    resAwr: 'AWR Afrikaans',
    visitEyebrow: 'Besoek Ons',
    visitHeading: 'Sluit by ons aan hierdie Sabbat',
    visitAddressLabel: 'Adres',
    copyAddress: 'Kopieer Adres',
    addressCopied: 'Gekopieer!',
    directionsCta: 'Kry Aanwysings',
    appleMapsCta: 'Maak oop in Apple Maps',
    footerBlurb: '’n Gemeente wat hoop, genesing en die liefde van Jesus met die Tygerberg-omgewing deel.',
    footerVisit: 'Besoek ons',
    footerTimesLabel: 'Dienstye',
  },
  en: {
    navAbout: 'About',
    navBeliefs: 'Beliefs',
    navMinistries: 'This Week',
    navVisit: 'Visit',
    navConnect: 'Connect',
    navResources: 'Resources',
    navDirections: 'Directions',
    give: 'Give',
    heroEyebrow: 'Seventh-day Adventist Church · Tygerberg',
    heroTitle: 'Find rest, hope and healing in Jesus',
    heroSub: 'Join us every Sabbath in Boston, Cape Town — or watch live from wherever you are.',
    ctaVisit: 'Visit our church',
    ctaWatch: 'Watch Live',
    liveLabel: 'LIVE',
    tabReplay: 'Recent Services',
    timesLabel: 'Sabbath Services',
    week: [
      { day: 'Tuesday', name: 'Prayer Meeting', time: '19:00 – 20:00' },
      { day: 'Wednesday', name: 'Bible Study', time: '19:00 – 21:00' },
      { day: 'Thursday', name: 'Volleyball', time: '19:00 – 21:00' },
      { day: 'Friday', name: 'Junior Youth', time: '19:00 – 21:00' },
    ],
    weekHeading: 'This week at church',
    weekSub: 'Everyone welcome — feel free to bring a friend.',
    months: [
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
    bloodBankName: 'Blood Bank',
    bloodBankTime: 'Closes 19:30',
    firstVisit: [
      {
        q: 'Where do I park?',
        a: 'There is secured parking on the premises, but it is limited. Arrive a little early if you want to be sure of a bay.',
      },
      {
        q: 'Is there anything for the children?',
        a: 'Yes — children’s programmes run from 09:30 to 11:00, while Sabbath School and Lesson Study are on. The children then join the congregation for the Divine Service.',
      },
      {
        q: 'Is the building wheelchair accessible?',
        a: 'Yes, the building is wheelchair accessible.',
      },
      {
        q: 'What do people wear?',
        a: 'Formal to semi-formal — church attire. You will not feel out of place in a jacket or a dress.',
      },
      {
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
    beliefTitles: ['God', 'Humanity', 'Salvation', 'The Church', 'Daily Living', 'Restoration'],
    beliefDescs: [
      'Scripture as the Word of God, the Trinity, and the character of the Father, Son and Holy Spirit.',
      'Creation and the nature of humanity, made in the image of God.',
      'The great controversy, the life, death and resurrection of Christ, and the experience of salvation.',
      'The church and its mission, unity in the body, baptism and the Lord’s Supper.',
      'The Sabbath, stewardship, the gift of prophecy, family and Christian living.',
      'Christ’s ministry in the heavenly sanctuary, His second coming, the resurrection and the new earth.',
    ],
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
    resLesson: 'Lesson Study Library',
    resHomebase: 'HomebaseTV Afrikaans',
    resAwr: 'AWR Afrikaans',
    visitEyebrow: 'Visit Us',
    visitHeading: 'Join us this Sabbath',
    visitAddressLabel: 'Address',
    copyAddress: 'Copy Address',
    addressCopied: 'Copied!',
    directionsCta: 'Get Directions',
    appleMapsCta: 'Open in Apple Maps',
    footerBlurb: 'A congregation sharing hope, healing and the love of Jesus with the Tygerberg community.',
    footerVisit: 'Visit us',
    footerTimesLabel: 'Service times',
  },
};
