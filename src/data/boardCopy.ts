import type { Lang } from './site';

/**
 * Copy for board mail inside the members area (/members) and for /login.
 * Afrikaans first — the document ships as lang="af" and the toggle swaps the
 * body client-side.
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
  /** Login card eyebrow, "Members only". */
  loginEyebrow: string;
  /** Screen-reader suffix on the unread count badge. */
  unreadSuffix: string;
  inboxTabs: string;
  tabInbox: string;
  tabSent: string;
  tabTrash: string;
  tabWrite: string;
  colItem: string;
  colTo: string;
  colSubject: string;
  topicConnect: string;
  topicBibleStudy: string;
  colFrom: string;
  colTopic: string;
  colDate: string;
  sectionNew: string;
  sectionReplied: string;
  emptyReplied: string;
  sentEmpty: string;
  sentBack: string;
  sentFrom: string;
  sentTo: string;
  sentOriginal: string;
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
  deleteLabel: string;
  deleteConfirm: string;
  deleting: string;
  trashLabel: string;
  trashConfirm: string;
  trashing: string;
  restoreLabel: string;
  restoring: string;
  deletePermanently: string;
  deletePermanentlyConfirm: string;
  deletingPermanently: string;
  trashEmpty: string;
  trashInbox: string;
  trashSent: string;
  errTrash: string;
  errRestore: string;
  errForbidden: string;
  errNotAllowed: string;
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
    pageTitle: 'Lede-area · Tygerberg SDA Kerk',
    pageDescription:
      'Privaat bladsy vir kerkraadslede: kerkraadpos en webwerf-inhoud.',
    backHome: 'Tuis',
    heading: 'Lede-area',
    sub: 'Kerkraadpos en webwerf-inhoud. Net vir kerkraadslede.',
    signIn: 'Gaan voort met Google',
    signInHint: 'Nie op die lys nie? Vra ’n kerkraadslid om jou Google-adres by te voeg.',
    loginHeading: 'Teken in',
    loginSub:
      'Kerkraadpos en webwerf-inhoud. Gebruik jou Google-rekening — die kerkraad gee toegang.',
    loginPageTitle: 'Teken in · Tygerberg SDA Kerk',
    loginPageDescription: 'Teken in met jou Google-rekening vir die lede-area: kerkraadpos en webwerf-inhoud.',
    privacyLabel: 'Privaatheidsbeleid',
    termsLabel: 'Algemene voorwaardes',
    signOut: 'Meld af',
    signedInAs: 'Aangemeld as',
    loginEyebrow: 'Net vir lede',
    unreadSuffix: 'nuwe boodskappe',
    inboxTabs: 'Kies inkassie, gestuurde boodskappe of nuwe boodskap',
    tabInbox: 'Inkassie',
    tabSent: 'Gestuur',
    tabTrash: 'Vuilbak',
    tabWrite: 'Nuwe boodskap',
    topicConnect: 'Verbind',
    topicBibleStudy: 'Bybelstudie',
    colItem: 'Boodskap',
    colFrom: 'Van',
    colTo: 'Aan',
    colSubject: 'Onderwerp',
    colTopic: 'Onderwerp',
    colDate: 'Ontvang',
    sectionNew: 'Nuut',
    sectionReplied: 'Beantwoord',
    emptyReplied: 'Nog geen beantwoorde boodskappe nie.',
    sentEmpty: 'Nog geen gestuurde boodskappe nie.',
    sentBack: 'Terug na gestuur',
    sentFrom: 'Van',
    sentTo: 'Aan',
    sentOriginal: 'Oorspronklike boodskap',
    replyAction: 'Antwoord',
    emptyHeading: 'Geen boodskappe nie',
    emptyBody: 'Boodskappe van die webwerf se vorms verskyn hier.',
    retry: 'Probeer weer',
    backToInbox: 'Terug na die inkassie',
    theirMessage: 'Hul boodskap',
    earlierReplies: 'Vroeër geantwoord',
    trashEmpty: 'Die vuilbak is leeg.',
    trashInbox: 'Deleted from Inbox.',
    trashSent: 'Deleted from Sent.',
    replyLabel: 'Antwoord',
    replyPlaceholder: 'Skryf jou antwoord hier …',
    replySubmit: 'Stuur antwoord',
    replySending: 'Stuur …',
    noEmailBody: 'Geen e-posadres verskaf nie — antwoord per telefoon.',
    deleteLabel: 'Vee uit',
    deleteConfirm: 'Vee hierdie boodskap uit?',
    deleting: 'Vee uit …',
    trashLabel: 'Gooi weg',
    trashConfirm: 'Gooi hierdie boodskap weg?',
    trashing: 'Gooi weg …',
    restoreLabel: 'Herstel',
    restoring: 'Herstel …',
    deletePermanently: 'Verwyder',
    deletePermanentlyConfirm: 'Hierdie boordskap word permanent verwyder — dit kan nie ongedaan gemaak word nie. Weet u seker?',
    deletingPermanently: 'Verwyder …',
    errForbidden: 'Net admins kan boodskappe uitvee.',
    errTrash: 'Die boodskap kon nie in die vuilbak beland nie. Probeer weer.',
    errRestore: 'Die boodskap kon nie herstel word nie. Probeer weer.',
    errNotAllowed: 'Jy mag nie as hierdie adres skryf nie.',
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
    errUnauthorised: 'Jy is nie op die kerkraadlys nie. Teken in met ’n ander rekening.',
    errNotConfigured: 'Die posdiens is nie opgestel nie. Probeer later weer.',
    errSend: 'Die e-pos kon nie gestuur word nie. Probeer weer.',
    errNetwork: 'Iets het met die verbinding verkeerd gegaan. Probeer weer.',
  },
  en: {
    pageTitle: 'Members area · Tygerberg SDA Church',
    pageDescription:
      'Private page for board members: board mail and website content.',
    backHome: 'Home',
    heading: 'Members area',
    sub: 'Board mail and website content. Board members only.',
    signIn: 'Continue with Google',
    signInHint: 'Not on the list? Ask a board member to add your Google address.',
    loginHeading: 'Sign in',
    loginSub:
      'Board mail and website content. Use your Google account — access is granted by the church board.',
    loginPageTitle: 'Sign in · Tygerberg SDA Church',
    loginPageDescription: 'Sign in with your Google account for the members area: board mail and website content.',
    privacyLabel: 'Privacy policy',
    termsLabel: 'Terms & conditions',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',
    loginEyebrow: 'Members only',
    unreadSuffix: 'new messages',
    inboxTabs: 'Choose inbox, sent mail or new message',
    tabInbox: 'Inbox',
    tabSent: 'Sent',
    tabTrash: 'Trash',
    tabWrite: 'New message',
    topicConnect: 'Connect',
    topicBibleStudy: 'Bible study',
    colItem: 'Message',
    colFrom: 'From',
    colTo: 'To',
    colSubject: 'Subject',
    colTopic: 'Topic',
    colDate: 'Received',
    sectionNew: 'New',
    sectionReplied: 'Replied',
    emptyReplied: 'No replied messages yet.',
    sentEmpty: 'No sent messages yet.',
    sentBack: 'Back to sent',
    sentFrom: 'From',
    sentTo: 'To',
    sentOriginal: 'Original message',
    replyAction: 'Reply',
    emptyHeading: 'No messages',
    emptyBody: 'Messages from the website’s forms appear here.',
    retry: 'Try again',
    backToInbox: 'Back to the inbox',
    theirMessage: 'Their message',
    earlierReplies: 'Answered before',
    trashEmpty: 'The trash is empty.',
    trashInbox: 'Deleted from Inbox.',
    trashSent: 'Deleted from Sent.',
    replyLabel: 'Reply',
    replyPlaceholder: 'Write your reply here …',
    replySubmit: 'Send reply',
    replySending: 'Sending …',
    noEmailBody: 'No email address given — answer by phone.',
    deleteLabel: 'Delete',
    deleteConfirm: 'Delete this message?',
    deleting: 'Deleting …',
    trashLabel: 'Trash',
    trashConfirm: 'Trash this message?',
    trashing: 'Trashing …',
    restoreLabel: 'Restore',
    restoring: 'Restoring …',
    deletePermanently: 'Delete',
    deletePermanentlyConfirm: 'This will be permanently deleted — it cannot be undone. Are you sure?',
    deletingPermanently: 'Deleting …',
    errForbidden: 'Only admins can delete messages.',
    errTrash: 'The message could not be trashed. Try again.',
    errRestore: 'The message could not be restored. Try again.',
    errNotAllowed: 'You may not send as this address.',
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
