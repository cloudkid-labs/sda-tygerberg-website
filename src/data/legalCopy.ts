import type { Lang } from './site';

/**
 * Copy for the Privacy Policy and Terms & Conditions pages.
 * Afrikaans first — the document ships as lang="af" and the toggle swaps
 * client-side; crawlers get Afrikaans.
 */
export type LegalCopy = {
  pageTitle: string;
  pageDescription: string;
  backHome: string;
  heading: string;
  intro: string;
  section(lang: Lang, key: string): string;
  body(lang: Lang, key: string): string;
  lastUpdated: string;
};

type LegalSection = Record<Lang, string>;

export const privacyCopy: Record<Lang, LegalCopy> = {
  af: {
    pageTitle: 'Privaatheidsbeleid · Tygerberg SDA Kerk',
    pageDescription:
      'Hoe Tygerberg SDA Kerk jou persoonlike inligting hanteer wanneer jy die webwerf gebruik, ' +
      '’n kontakformulier stuur of as kerkraad vanaf amptelike adresse skryf.',
    backHome: 'Tuis',
    heading: 'Privaatheidsbeleid',
    intro:
      'Tygerberg SDA Kerk respekteer jou privaatheid. Hierdie beleid verklaar wat inligting die kerk ' +
      'insamel, hoe dit gebruik en gedeel word, en watter keuses jy het.',
    section: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        what: { af: 'Wat die kerk insamel', en: 'What the church collects' },
        how: { af: 'Hoe dit gebruik word', en: 'How it is used' },
        share: { af: 'Wanneer dit gedeel word', en: 'When it is shared' },
        cookies: { af: 'Koekies', en: 'Cookies' },
        rights: { af: 'Jou regte', en: 'Your rights' },
        contact: { af: 'Vrae oor hierdie beleid', en: 'Questions about this policy' },
      };
      return map[key][l];
    },
    body: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        what: {
          af:
            'Die kerk insamel jou naam en e-posadres net wanneer jy selfelik dié by die kontak- of ' +
            'kerkraadformulier verskaf. Die kerkraadpos blad hou ’n enregistrum van boodskappe wat as ' +
            'amptelike kerkadresse gestuur word, waaronder die afsender se e-posadres en die ontvanger.',
          en:
            'The church collects your name and email address only when you supply them through the ' +
            'contact or board-mail forms. The board-mail page keeps a record of messages sent as official ' +
            'church addresses, including the sender’s email address and the recipient.',
        },
        how: {
          af:
            'Inligting word gebruik om jou boodskap te beantwoord, om kerkraadpos te stuur namens die kerk, ' +
            'en om die webwerf en die e-posdiens te bedryf en te beskerm.',
          en:
            'Information is used to answer your message, to send board mail on behalf of the church, and to ' +
            'operate and protect the website and the email service.',
        },
        share: {
          af:
            'Die kerk deel jou persoonlike inligting met niemand behalwe ' +
            'Brevo, wat die e-pos namens die kerk verstuur, en met die kerkraadlid wat ' +
            'die desbetreffende amptelike adresse bestuur. Jy word nie op die webwerf gevolg nie.',
          en:
            'The church shares your personal information with no one except ' +
            'Brevo, which sends email on behalf of the church, and with the board member ' +
            'who manages the relevant official address. You are not tracked on the website.',
        },
        cookies: {
          af:
            'Die webwerf gebruik geen spooringkoekies. ' +
            'Slegs noodwendige koekies vir die taalkeuse en die sesie word geplaas.',
          en:
            'The website places no tracking cookies. Only necessary cookies for the language choice ' +
            'and the session are set.',
        },
        rights: {
          af:
            'Jy mag vra welke inligting die kerk oor jou het, korreksie of verwydering ' +
            'vra, en aftrede van e-poslisings. Stuur ’n e-pos aan die kerkklerk by die adres onder.',
          en:
            'You may ask what information the church holds about you, request correction or deletion, ' +
            'and opt out of email lists. Send an email to the church clerk at the address below.',
        },
        contact: {
          af:
            'Vrae oor hierdie beleid of oor jou inligting kan gerig word aan die kerkklerk, ' +
            'sdatygerbergklerk@gmail.com.',
          en:
            'Questions about this policy or about your information may be directed to the church clerk, ' +
            'sdatygerbergklerk@gmail.com.',
        },
      };
      return map[key][l];
    },
    lastUpdated: 'Laatste bywerking: 25 Oktober 2026',
  },
  en: {
    pageTitle: 'Privacy Policy · Tygerberg SDA Church',
    pageDescription:
      'How Tygerberg SDA Church handles your personal information when you use the website, ' +
      'send a contact form, or write as board mail from official addresses.',
    backHome: 'Home',
    heading: 'Privacy policy',
    intro:
      'Tygerberg SDA Church respects your privacy. This policy explains what information the church ' +
      'collects, how it is used and shared, and what choices you have.',
    section: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        what: { af: 'Wat die kerk insamel', en: 'What the church collects' },
        how: { af: 'Hoe dit gebruik word', en: 'How it is used' },
        share: { af: 'Wanneer dit gedeel word', en: 'When it is shared' },
        cookies: { af: 'Koekies', en: 'Cookies' },
        rights: { af: 'Jou regte', en: 'Your rights' },
        contact: { af: 'Vrae oor hierdie beleid', en: 'Questions about this policy' },
      };
      return map[key][l];
    },
    body: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        what: {
          af:
            'Die kerk insamel jou naam en e-posadres net wanneer jy selfelik dié by die kontak- of ' +
            'kerkraadformulier verskaf. Die kerkraadpos blad hou ’n enregistrum van boodskappe wat as ' +
            'amptelike kerkadresse gestuur word, waaronder die afsender se e-posadres en die ontvanger.',
          en:
            'The church collects your name and email address only when you supply them through the ' +
            'contact or board-mail forms. The board-mail page keeps a record of messages sent as official ' +
            'church addresses, including the sender’s email address and the recipient.',
        },
        how: {
          af:
            'Inligting word gebruik om jou boodskap te beantwoord, om kerkraadpos te stuur namens die kerk, ' +
            'en om die webwerf en die e-posdiens te bedryf en te beskerm.',
          en:
            'Information is used to answer your message, to send board mail on behalf of the church, and to ' +
            'operate and protect the website and the email service.',
        },
        share: {
          af:
            'Die kerk deel jou persoonlike inligting met niemand behalwe ' +
            'Brevo, wat die e-pos namens die kerk verstuur, en met die kerkraadlid wat ' +
            'die desbetreffende amptelike adresse bestuur. Jy word nie op die webwerf gevolg nie.',
          en:
            'The church shares your personal information with no one except ' +
            'Brevo, which sends email on behalf of the church, and with the board member ' +
            'who manages the relevant official address. You are not tracked on the website.',
        },
        cookies: {
          af:
            'Die webwerf gebruik geen spooringkoekies. ' +
            'Slegs noodwendige koekies vir die taalkeuse en die sesie word geplaas.',
          en:
            'The website places no tracking cookies. Only necessary cookies for the language choice ' +
            'and the session are set.',
        },
        rights: {
          af:
            'Jy mag vra welke inligting die kerk oor jou het, korreksie of verwydering ' +
            'vra, en aftrede van e-poslisings. Stuur ’n e-pos aan die kerkklerk by die adres onder.',
          en:
            'You may ask what information the church holds about you, request correction or deletion, ' +
            'and opt out of email lists. Send an email to the church clerk at the address below.',
        },
        contact: {
          af:
            'Vrae oor hierdie beleid of oor jou inligting kan gerig word aan die kerkklerk, ' +
            'sdatygerbergklerk@gmail.com.',
          en:
            'Questions about this policy or about your information may be directed to the church clerk, ' +
            'sdatygerbergklerk@gmail.com.',
        },
      };
      return map[key][l];
    },
    lastUpdated: 'Last updated: 25 October 2026',
  },
};

export const termsCopy: Record<Lang, LegalCopy> = {
  af: {
    pageTitle: 'Algemene voorwaardes · Tygerberg SDA Kerk',
    pageDescription:
      'Die voorwaardes waaronder jy die webwerf van Tygerberg SDA Kerk gebruik, ' +
      'insluitend die kerkraadpos en die kontakformulier.',
    backHome: 'Tuis',
    heading: 'Algemene voorwaardes',
    intro:
      'Hierdie voorwaardes geld wanneer jy die webwerf van Tygerberg SDA Kerk gebruik. ' +
    'Deur die webwerf te gebruik stem jy daarmee in.',
    section: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        use: { af: 'Gebruik van die webwerf', en: 'Use of the website' },
        mail: { af: 'E-pos en kerkraadpos', en: 'Email and board mail' },
        conduct: { af: 'Aanvaarbare gebruik', en: 'Acceptable use' },
        liability: { af: 'Aanspreeklikheid', en: 'Liability' },
        changes: { af: 'Wysigings', en: 'Changes' },
        contact: { af: 'Vrae', en: 'Questions' },
      };
      return map[key][l];
    },
    body: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        use: {
          af:
            'Jy mag die webwerf gebruik om dienste, tye en inligting oor die kerk te sien. ' +
            'Jy mag nie die webwerf gebruik om dit te beskadig, te belaai of enige ander gebruiker te hinder nie.',
          en:
            'You may use the website to view services, times and information about the church. ' +
            'You must not use the website to damage it, overload it, or hinder any other user.',
        },
        mail: {
          af:
            'Die kerkraadpos blad is net vir lede met ’n leierspos ( ’n ampsdraer) in die kerk wat ' +
            'met Google aangemeld is en op die kerkraadlys staan. Booodskappe word namens die kerk se ' +
            'amptelike adresse gestuur en kan deur die kerk gekopieer en bewaar word.',
          en:
            'The board-mail page is for anyone with a lead position (an office-bearer) in the church who ' +
            'is signed in with Google and on the board list. Messages are sent on behalf of the church’s ' +
            'official addresses and may be copied and retained by the church.',
        },
        conduct: {
          af:
            'Jy mag geen onregmatige, lasterlike of bedreigende inhoud stuur nie, en nie irgendwelke ' +
            'inligting wat jy nie die reg het om te deel nie.',
          en:
            'You must not send unlawful, defamatory or threatening content, nor any information ' +
            'you have no right to share.',
        },
        liability: {
          af:
            'Die kerk stel die webwerf beskikbaar “soos dit is”, sonder enige waarborg. ' +
            'Die kerk is nie aanspreeklik vir verlies wat voortvloeit uit die gebruik van die webwerf nie.',
          en:
            'The church provides the website “as is”, without any warranty. ' +
            'The church is not liable for loss arising from use of the website.',
        },
        changes: {
          af:
            'Die kerk mag hierdie voorwaardes enige tyd wysig. Die wysigde weerspieël die datum onder.',
          en:
            'The church may change these terms at any time. Changes carry the date below.',
        },
        contact: {
          af:
            'Vrae kan gerig word aan die kerkklerk, sdatygerbergklerk@gmail.com.',
          en:
            'Questions may be directed to the church clerk, sdatygerbergklerk@gmail.com.',
        },
      };
      return map[key][l];
    },
    lastUpdated: 'Laatste bywerking: 25 Oktober 2026',
  },
  en: {
    pageTitle: 'Terms & Conditions · Tygerberg SDA Church',
    pageDescription:
      'The terms under which you use the Tygerberg SDA Church website, including board mail ' +
      'and the contact form.',
    backHome: 'Home',
    heading: 'Terms & conditions',
    intro:
      'These terms apply when you use the Tygerberg SDA Church website. ' +
    'By using the website you agree to them.',
    section: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        use: { af: 'Gebruik van die webwerf', en: 'Use of the website' },
        mail: { af: 'E-pos en kerkraadpos', en: 'Email and board mail' },
        conduct: { af: 'Aanvaarbare gebruik', en: 'Acceptable use' },
        liability: { af: 'Aanspreeklikheid', en: 'Liability' },
        changes: { af: 'Wysigings', en: 'Changes' },
        contact: { af: 'Vrae', en: 'Questions' },
      };
      return map[key][l];
    },
    body: (l: Lang, key: string) => {
      const map: Record<string, LegalSection> = {
        use: {
          af:
            'Jy mag die webwerf gebruik om dienste, tye en inligting oor die kerk te sien. ' +
            'Jy mag nie die webwerf gebruik om dit te beskadig, te belaai of enige ander gebruiker te hinder nie.',
          en:
            'You may use the website to view services, times and information about the church. ' +
            'You must not use the website to damage it, overload it, or hinder any other user.',
        },
        mail: {
          af:
            'Die kerkraadpos blad is net vir lede met ’n leierspos ( ’n ampsdraer) in die kerk wat ' +
            'met Google aangemeld is en op die kerkraadlys staan. Booodskappe word namens die kerk se ' +
            'amptelike adresse gestuur en kan deur die kerk gekopieer en bewaar word.',
          en:
            'The board-mail page is for anyone with a lead position (an office-bearer) in the church who ' +
            'is signed in with Google and on the board list. Messages are sent on behalf of the church’s ' +
            'official addresses and may be copied and retained by the church.',
        },
        conduct: {
          af:
            'Jy mag geen onregmatige, lasterlike of bedreigende inhoud stuur nie, en nie irgendwelke ' +
            'inligting wat jy nie die reg het om te deel nie.',
          en:
            'You must not send unlawful, defamatory or threatening content, nor any information ' +
            'you have no right to share.',
        },
        liability: {
          af:
            'Die kerk stel die webwerf beskikbaar “soos dit is”, sonder enige waarborg. ' +
            'Die kerk is nie aanspreeklik vir verlies wat voortvloeit uit die gebruik van die webwerf nie.',
          en:
            'The church provides the website “as is”, without any warranty. ' +
            'The church is not liable for loss arising from use of the website.',
        },
        changes: {
          af:
            'Die kerk mag hierdie voorwaardes enige tyd wysig. Die wysigde weerspieël die datum onder.',
          en:
            'The church may change these terms at any time. Changes carry the date below.',
        },
        contact: {
          af:
            'Vrae kan gerig word aan die kerkklerk, sdatygerbergklerk@gmail.com.',
          en:
            'Questions may be directed to the church clerk, sdatygerbergklerk@gmail.com.',
        },
      };
      return map[key][l];
    },
    lastUpdated: 'Last updated: 25 October 2026',
  },
};
