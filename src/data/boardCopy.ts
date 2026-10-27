import type { Lang } from './site';

/**
 * Copy for the private board-mail page (/kerkraad). Afrikaans first — the
 * document ships as lang="af" and the toggle swaps the body client-side.
 */

export type BoardCopy = {
  pageTitle: string;
  pageDescription: string;
  backHome: string;
  heading: string;
  sub: string;
  signIn: string;
  signInHint: string;
  loginHeading: string;
  loginSub: string;
  loginPageTitle: string;
  loginPageDescription: string;
  privacyLabel: string;
  termsLabel: string;
  signOut: string;
  signedInAs: string;
  inboxTabs: string;
  tabInbox: string;
  tabWrite: string;
  topicConnect: string;
  topicBibleStudy: string;
  colFrom: string;
  colTopic: string;
  colDate: string;
  sectionNew: string;
  sectionReplied: string;
  emptyReplied: string;
  replyAction: string;
  emptyHeading: string;
  emptyBody: string;
  retry: string;
  backToInbox: string;
  theirMessage: string;
  earlierReplies: string;
  replyLabel: string;
  replyPlaceholder: string;
  replySubmit: string;
  replySending: string;
  noEmailBody: string;
  fromLabel: string;
  toLabel: string;
  toPlaceholder: string;
  toHint: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  submit: string;
  submitting: string;
  successHeading: string;
  successBody: string;
  sendAnother: string;
  errValidation: string;
  errUnauthorised: string;
  errNotConfigured: string;
  errSend: string;
  errNetwork: string;
};

export const FROM_ADDRESSES = [
  'welkom@sdatygerberg.co.za',
  'klerk@sdatygerberg.co.za',
  'tesourier@sdatygerberg.co.za',
  'kerk@sdatygerberg.co.za',
];

export const boardCopy: Record<Lang, BoardCopy> = {
  af: {
    pageTitle: 'Kerkraadpos · Tygerberg SDA Kerk',
    pageDescription:
      'Privaat bladsy vir kerkraadslede om as die kerk se amptelike adresse te skryf.',
    backHome: 'Tuis',
    heading: 'Kerkraadpos',
    sub: 'Boodskappe van besoekers, en skryf as die kerk se amptelike adresse. Net kerkraadslede het toegang.',
    signIn: 'Meld aan met Google',
    signInHint: 'Jou Google-rekening moet op die kerkraadlys wees.',
    loginHeading: 'Meld aan',
    loginSub:
      'Die kerkraadpos is vir lede met ’n leierspos (’n ampsdraer) in die kerk. Meld aan met jou Google-rekening om voort te gaan.',
    loginPageTitle: 'Meld aan · Tygerberg SDA Kerk',
    loginPageDescription: 'Meld aan met jou Google-rekening vir kerkraadpos.',
    privacyLabel: 'Privaatheidsbeleid',
    termsLabel: 'Algemene voorwaardes',
    signOut: 'Meld af',
    signedInAs: 'Aangemeld as',
    inboxTabs: 'Kies inkassie of nuwe boodskap',
    tabInbox: 'Inkassie',
    tabWrite: 'Nuwe boodskap',
    topicConnect: 'Verbind',
    topicBibleStudy: 'Bybelstudie',
    colFrom: 'Van',
    colTopic: 'Onderwerp',
    colDate: 'Ontvang',
    sectionNew: 'Nuut',
    sectionReplied: 'Beantwoord',
    emptyReplied: 'Nog geen beantwoorde boodskappe nie.',
    replyAction: 'Antwoord',
    emptyHeading: 'Geen boodskappe nie',
    emptyBody: 'Boodskappe van die webwerf se vorms verskyn hier.',
    retry: 'Probeer weer',
    backToInbox: 'Terug na die inkassie',
    theirMessage: 'Hul boodskap',
    earlierReplies: 'Vroeër geantwoord',
    replyLabel: 'Antwoord',
    replyPlaceholder: 'Skryf jou antwoord hier …',
    replySubmit: 'Stuur antwoord',
    replySending: 'Stuur …',
    noEmailBody: 'Geen e-posadres verskaf nie — antwoord per telefoon.',
    fromLabel: 'Stuur as',
    toLabel: 'Aan',
    toPlaceholder: 'ontvanger@voorbeeld.co.za',
    toHint: 'Tot vyf ontvangers, deur kommas geskei.',
    subjectLabel: 'Onderwerp',
    subjectPlaceholder: 'Onderwerp van die e-pos',
    bodyLabel: 'Boodskap',
    bodyPlaceholder: 'Skryf jou boodskap hier …',
    submit: 'Stuur e-pos',
    submitting: 'Stuur …',
    successHeading: 'E-pos gestuur',
    successBody: 'Die boodskap is namens die kerk gestuur.',
    sendAnother: 'Skryf nog een',
    errValidation: 'Kontroleer die gemerkte velde en probeer weer.',
    errUnauthorised: 'Jy is nie op die kerkraadlys nie. Meld aan met ’n ander rekening.',
    errNotConfigured: 'Die posdiens is nie opgestel nie. Probeer later weer.',
    errSend: 'Die e-pos kon nie gestuur word nie. Probeer weer.',
    errNetwork: 'Iets het met die verbinding verkeerd gegaan. Probeer weer.',
  },
  en: {
    pageTitle: 'Board Mail · Tygerberg SDA Church',
    pageDescription:
      'Private page for board members to write as the church’s official addresses.',
    backHome: 'Home',
    heading: 'Board mail',
    sub: 'Messages from visitors, and write as the church’s official addresses. Board members only.',
    signIn: 'Sign in with Google',
    signInHint: 'Your Google account must be on the board list.',
    loginHeading: 'Sign in',
    loginSub:
      'Board mail is for anyone with a lead position (an office-bearer) in the church. Sign in with your Google account to continue.',
    loginPageTitle: 'Sign in · Tygerberg SDA Church',
    loginPageDescription: 'Sign in with your Google account for board mail.',
    privacyLabel: 'Privacy policy',
    termsLabel: 'Terms & conditions',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',
    inboxTabs: 'Choose inbox or new message',
    tabInbox: 'Inbox',
    tabWrite: 'New message',
    topicConnect: 'Connect',
    topicBibleStudy: 'Bible study',
    colFrom: 'From',
    colTopic: 'Topic',
    colDate: 'Received',
    sectionNew: 'New',
    sectionReplied: 'Replied',
    emptyReplied: 'No replied messages yet.',
    replyAction: 'Reply',
    emptyHeading: 'No messages',
    emptyBody: 'Messages from the website’s forms appear here.',
    retry: 'Try again',
    backToInbox: 'Back to the inbox',
    theirMessage: 'Their message',
    earlierReplies: 'Answered before',
    replyLabel: 'Reply',
    replyPlaceholder: 'Write your reply here …',
    replySubmit: 'Send reply',
    replySending: 'Sending …',
    noEmailBody: 'No email address given — answer by phone.',
    fromLabel: 'Send as',
    toLabel: 'To',
    toPlaceholder: 'recipient@example.co.za',
    toHint: 'Up to five recipients, separated by commas.',
    subjectLabel: 'Subject',
    subjectPlaceholder: 'Email subject',
    bodyLabel: 'Message',
    bodyPlaceholder: 'Write your message here …',
    submit: 'Send email',
    submitting: 'Sending …',
    successHeading: 'Email sent',
    successBody: 'The message was sent on behalf of the church.',
    sendAnother: 'Write another',
    errValidation: 'Check the highlighted fields and try again.',
    errUnauthorised: 'You are not on the board list. Sign in with a different account.',
    errNotConfigured: 'The mail service is not set up. Try again later.',
    errSend: 'The email could not be sent. Try again.',
    errNetwork: 'Something went wrong with the connection. Try again.',
  },
};
