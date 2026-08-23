import type { Lang } from './site';

/**
 * Copy for the two request pages (/connect and /bible-studies). Both render the
 * same shell and the same form; only `requestTopics` differs between them.
 *
 * The `topic` string is also the value posted to /api/contact — it's how the
 * church tells a general enquiry apart from a Bible-study request when the
 * submission lands in their inbox. Changing it here changes the wire format.
 */
export type RequestTopic = 'connect' | 'bible-study';

export type TopicCopy = {
  /** Browser tab / meta description, kept out of the visible page copy. */
  pageTitle: string;
  pageDescription: string;
  eyebrow: string;
  heading: string;
  sub: string;
  /** What the visitor can expect once they send it. */
  expectations: string[];
  messageLabel: string;
  messagePlaceholder: string;
  submit: string;
};

export type FormCopy = {
  backHome: string;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  optional: string;
  contactHint: string;
  privacyHeading: string;
  privacyBody: string;
  consentLabel: string;
  submitting: string;
  successHeading: string;
  successBody: string;
  successAgain: string;
  errName: string;
  errContact: string;
  errEmail: string;
  errPhone: string;
  errConsent: string;
  errValidation: string;
  /** A rejection that isn't pinned to any visible field — too long, bad topic. */
  errUnexpected: string;
  errNotConfigured: string;
  errForward: string;
  errNetwork: string;
  previewNotice: string;
  otherWaysHeading: string;
  otherWaysBody: string;
  addressLabel: string;
  timesLabel: string;
  directionsCta: string;
};

export const requestTopics: Record<RequestTopic, Record<Lang, TopicCopy>> = {
  connect: {
    af: {
      pageTitle: 'Verbind · Tygerberg SDA Kerk',
      pageDescription:
        'Het jy ’n vraag of wil jy met iemand by Tygerberg SDA Kerk gesels? Stuur ’n boodskap en ons stel jou aan die regte persoon voor.',
      eyebrow: 'Raak Betrokke',
      heading: 'Verbind met ons',
      sub: 'Het jy ’n vraag, wil jy met iemand gesels, of soek jy gebed? Laat weet ons hier onder en ons stel jou aan die regte persoon in die gemeente voor.',
      expectations: [
        'Ons stuur jou versoek aan die persoon wat die beste kan help.',
        'Iemand tree gewoonlik binne ’n paar dae met jou in verbinding.',
        'Daar is geen koste en geen verpligting nie.',
      ],
      messageLabel: 'Jou boodskap',
      messagePlaceholder: 'Waarmee kan ons help?',
      submit: 'Stuur boodskap',
    },
    en: {
      pageTitle: 'Connect · Tygerberg SDA Church',
      pageDescription:
        'Have a question or want to talk to someone at Tygerberg SDA Church? Send a message and we’ll introduce you to the right person.',
      eyebrow: 'Get Involved',
      heading: 'Connect with us',
      sub: 'Have a question, want to talk to someone, or looking for prayer? Let us know below and we’ll introduce you to the right person in the congregation.',
      expectations: [
        'We pass your request to the person best placed to help.',
        'Someone usually gets back to you within a few days.',
        'There’s no cost and no obligation.',
      ],
      messageLabel: 'Your message',
      messagePlaceholder: 'How can we help?',
      submit: 'Send message',
    },
  },
  'bible-study': {
    af: {
      pageTitle: 'Bybelstudies · Tygerberg SDA Kerk',
      pageDescription:
        'Vra ’n gratis Bybel- of doopstudie aan by Tygerberg SDA Kerk — by jou tuiste, by die kerk, of aanlyn.',
      eyebrow: 'Bybelstudies',
      heading: 'Vra ’n gratis Bybelstudie aan',
      sub: 'Ons bied gratis Bybel- en doopstudies aan — by jou tuiste, by die kerk, of aanlyn. Jy kies die tempo en die onderwerpe.',
      expectations: [
        'Die studies is heeltemal gratis en jy kan enige tyd ophou.',
        'Ons werk om jou skedule — een keer per week is die algemeenste.',
        'Jy kan alleen studeer of jou gesin en vriende saamnooi.',
      ],
      messageLabel: 'Vertel ons meer',
      messagePlaceholder:
        'Bv. wanneer dit jou pas, waar jy bly, of ’n onderwerp waarin jy belangstel.',
      submit: 'Vra ’n studie aan',
    },
    en: {
      pageTitle: 'Bible Studies · Tygerberg SDA Church',
      pageDescription:
        'Request a free Bible or baptismal study from Tygerberg SDA Church — in your home, at church, or online.',
      eyebrow: 'Bible Studies',
      heading: 'Request a free Bible study',
      sub: 'We offer free Bible and baptismal studies — in your home, at church, or online. You set the pace and the topics.',
      expectations: [
        'The studies are completely free and you can stop at any time.',
        'We work around your schedule — once a week is the most common.',
        'You can study on your own or invite family and friends along.',
      ],
      messageLabel: 'Tell us more',
      messagePlaceholder: 'E.g. when suits you, where you live, or a topic you’re interested in.',
      submit: 'Request a study',
    },
  },
};

export const requestFormCopy: Record<Lang, FormCopy> = {
  af: {
    backHome: 'Terug na Tuisblad',
    nameLabel: 'Jou naam',
    emailLabel: 'E-posadres',
    phoneLabel: 'Telefoonnommer',
    optional: 'opsioneel',
    contactHint: 'Gee ten minste een — dis hoe ons jou antwoord.',
    privacyHeading: 'Hoe ons jou inligting gebruik',
    privacyBody:
      'Tygerberg Sewendedag Adventiste Kerk gebruik die besonderhede wat jy hier verskaf slegs om op hierdie versoek te reageer. Ons deel dit nie met derde partye nie en gebruik dit nie vir enigiets anders nie. Vra enige tyd dat ons jou besonderhede verwyder.',
    consentLabel:
      'Ek gee toestemming dat die kerk my besonderhede mag gebruik om my oor hierdie versoek te kontak.',
    submitting: 'Besig om te stuur…',
    successHeading: 'Dankie — ons het jou versoek ontvang.',
    successBody: 'Iemand van die gemeente sal binnekort met jou in verbinding tree.',
    successAgain: 'Stuur nog een',
    errName: 'Vul asseblief jou naam in.',
    errContact: 'Gee ’n e-posadres of ’n telefoonnommer sodat ons kan antwoord.',
    errEmail: 'Hierdie e-posadres lyk nie reg nie.',
    errPhone: 'Kyk asseblief die telefoonnommer na.',
    errConsent: 'Ons het jou toestemming nodig voordat ons jou kan kontak.',
    errValidation: 'Kyk asseblief die gemerkte velde na.',
    // Shown for every rejected submission with no field to highlight — a bad
    // topic and a malformed body reach it too, not only an over-long message.
    errUnexpected:
      'Ons kon nie hierdie versoek aanvaar nie. Kyk asseblief jou besonderhede en boodskap na en probeer weer. ’n Baie lang boodskap is gewoonlik die oorsaak.',
    errNotConfigured:
      'Die aanlyn vorm is nog nie aktief nie. Kom gerus Sabbatoggend by die kerk aan — ons help jou graag persoonlik.',
    errForward: 'Ons kon nie jou versoek deurstuur nie. Probeer asseblief weer oor ’n rukkie.',
    errNetwork: 'Iets het verkeerd geloop. Kyk of jy aanlyn is en probeer weer.',
    previewNotice:
      'Dit is ’n voorskou van die werf — die vorm stuur nog nie versoeke deur nie.',
    otherWaysHeading: 'Ander maniere om ons te bereik',
    otherWaysBody: 'Jy is elke Sabbat welkom by die kerk — kom groet gerus ná die diens.',
    addressLabel: 'Adres',
    timesLabel: 'Sabbatdienste',
    directionsCta: 'Kry Aanwysings',
  },
  en: {
    backHome: 'Back to Homepage',
    nameLabel: 'Your name',
    emailLabel: 'Email address',
    phoneLabel: 'Phone number',
    optional: 'optional',
    contactHint: 'Give at least one — it’s how we reply to you.',
    privacyHeading: 'How we use your information',
    privacyBody:
      'Tygerberg Seventh-day Adventist Church uses the details you provide here only to respond to this request. We don’t share them with third parties or use them for anything else. Ask us to delete your details at any time.',
    consentLabel: 'I consent to the church using my details to contact me about this request.',
    submitting: 'Sending…',
    successHeading: 'Thank you — we’ve received your request.',
    successBody: 'Someone from the congregation will be in touch with you soon.',
    successAgain: 'Send another',
    errName: 'Please enter your name.',
    errContact: 'Please give an email address or a phone number so we can reply.',
    errEmail: 'That email address doesn’t look right.',
    errPhone: 'Please check the phone number.',
    errConsent: 'We need your consent before we can contact you.',
    errValidation: 'Please check the highlighted fields.',
    errUnexpected:
      'We couldn’t accept this request. Please check your details and message, then try again. A very long message is the usual cause.',
    errNotConfigured:
      'The online form isn’t live yet. You’re very welcome to join us on Sabbath morning — we’d love to help you in person.',
    errForward: 'We couldn’t send your request through. Please try again in a little while.',
    errNetwork: 'Something went wrong. Check that you’re online and try again.',
    previewNotice: 'This is a preview of the site — the form doesn’t send requests through yet.',
    otherWaysHeading: 'Other ways to reach us',
    otherWaysBody: 'You’re welcome at church every Sabbath — please come and say hello afterwards.',
    addressLabel: 'Address',
    timesLabel: 'Sabbath Services',
    directionsCta: 'Get Directions',
  },
};
