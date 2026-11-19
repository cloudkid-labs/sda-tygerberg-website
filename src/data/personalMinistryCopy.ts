import type { Lang } from './site';

export type PersonalMinistryCopy = {
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  sub: string;
  acceptHeading: string;
  acceptIntro: string;
  acceptItems: { title: string; text: string }[];
  noHeading: string;
  noBody: string;
  processHeading: string;
  processBody: string;
  binHeading: string;
  binBody: string;
  ctaHeading: string;
  ctaText: string;
  ctaLabel: string;
  thanks: string;
};

export const personalMinistryCopy: Record<Lang, PersonalMinistryCopy> = {
  af: {
    pageTitle: 'Persoonlike Bediening · Tygerberg SDA Kerk',
    pageDescription:
      'Skenk skoon klere, skoene en komberse by die klerehouer van Tygerberg SDA Kerk. Ons sorteer dit en gee dit aan behoeftiges.',
    eyebrow: 'Persoonlike Bediening',
    heading: 'Persoonlike Bediening',
    sub: 'Het jy klere wat jy nie meer dra nie? Was dit, sit dit in ’n sak en plaas dit in die klerehouer by die kerk — ons sorg dat dit by iemand kom wat dit regtig nodig het.',
    acceptHeading: 'Wat ons aanvaar',
    acceptIntro: 'Skoon en heeltemal — as jy dit self sou dra, kan iemand anders ook.',
    acceptItems: [
      { title: 'Klere', text: 'Skoon, heel klere vir kinders en volwassenes.' },
      { title: 'Skoene', text: 'Draagbare skoene, twee-twee vasgemaak.' },
      { title: 'Komberse', text: 'Skoon komberse en beddegoed vir die winter.' },
    ],
    noHeading: 'Wat ons nie kan neem nie',
    noBody:
      'Asseblief geen stukkende of vuil klere, matrasse, meubels, elektronika of kos nie — dit kan ons nie uitdeel nie en dit verstop die houer.',
    processHeading: 'Wat gebeur met jou skenking',
    processBody:
      'Vrywilligers sorteer elke sak, en wat draagbaar is gaan reguit aan behoeftiges in ons omgewing — gesinne in nood en ramphulp waar dit nodig is. Wat oorbly word verantwoordelik herwin.',
    binHeading: 'So werk die houer',
    binBody:
      'Sit jou skenking in ’n toe sak en druk dit deur die houer se opening. Die houer staan by die kerk en is enige tyd oop — jy hoef niemand te bel of ’n afspraak te maak nie.',
    ctaHeading: 'Waar is die houer?',
    ctaText: 'Die klerehouer staan by Tygerberg SDA Kerk. Kom loer gerus op ’n Sabbatoggend in, of kontak ons as jy ’n groot vrag het.',
    ctaLabel: 'Kontak ons',
    thanks: 'Baie dankie — jou sakkie klere is iemand se warm trui hierdie winter.',
  },
  en: {
    pageTitle: 'Personal Ministry · Tygerberg SDA Church',
    pageDescription:
      'Donate clean clothes, shoes and blankets at the clothing bin of Tygerberg SDA Church. We sort them and give them to people in need.',
    eyebrow: 'Personal Ministry',
    heading: 'Personal Ministry',
    sub: 'Have clothes you no longer wear? Wash them, bag them and drop them in the clothing bin at the church — we will make sure they reach someone who truly needs them.',
    acceptHeading: 'What we accept',
    acceptIntro: 'Clean and whole — if you would still wear it, someone else can too.',
    acceptItems: [
      { title: 'Clothes', text: 'Clean, intact clothing for children and adults.' },
      { title: 'Shoes', text: 'Wearable shoes, tied together in pairs.' },
      { title: 'Blankets', text: 'Clean blankets and bedding for the winter.' },
    ],
    noHeading: 'What we cannot take',
    noBody:
      'Please no torn or dirty clothing, mattresses, furniture, electronics or food — we cannot hand those out and they block the bin.',
    processHeading: 'What happens to your donation',
    processBody:
      'Volunteers sort every bag, and whatever is wearable goes straight to people in need in our area — families in distress and disaster relief where needed. The rest is recycled responsibly.',
    binHeading: 'How the bin works',
    binBody:
      'Put your donation in a closed bag and push it through the bin opening. The bin stands at the church and is open at any time — no need to call or book.',
    ctaHeading: 'Where is the bin?',
    ctaText: 'The clothing bin stands at Tygerberg SDA Church. Visit us on a Sabbath morning, or contact us if you have a large load.',
    ctaLabel: 'Contact us',
    thanks: 'Thank you — your bag of clothes is somebody’s warm jersey this winter.',
  },
};
