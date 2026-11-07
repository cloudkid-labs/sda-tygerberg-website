import type { Lang } from './site';

/**
 * Payment options are temporarily unpublished. Keep these values empty while
 * the /giving page displays its unavailable notice.
 */
export const BANKING_DETAILS = {
  organisation: '',
  bank: '',
  accountNumber: '',
  branchCode: '',
};

export const ZAPPER: { url: string; qr: string } = {
  url: '',
  qr: '',
};

export type GivingCopy = {
  backHome: string;
  eyebrow: string;
  heading: string;
  sub: string;
  /** EFT block */
  accountDetailsLabel: string;
  bankLabel: string;
  accountNumberLabel: string;
  branchCodeLabel: string;
  referenceLabel: string;
  referenceNote: string;
  copyLabel: string;
  copiedLabel: string;
  /** Zapper block */
  zapperTitle: string;
  zapperDesc: string;
  zapperCta: string;
  /** Used when a pay button is also shown. */
  zapperScan: string;
  /** Used when the QR is the only way to pay. */
  zapperScanOnly: string;
  zapperQrAlt: string;
  /** Closing note */
  thanks: string;
  pageTitle: string;
  /** True whatever is published. The Zapper clause is appended separately. */
  pageDescription: string;
  /** Appended to the description only once Zapper is actually live. */
  pageDescriptionZapper: string;
};

export const givingCopy: Record<Lang, GivingCopy> = {
  af: {
    backHome: 'Terug tuis',
    eyebrow: 'Gee',
    heading: 'Ondersteun die bediening',
    sub: 'Tiendes en offergawes hou die gemeente se bediening aan die gang. Kies wat vir jou die maklikste is.',
    accountDetailsLabel: 'Bank Besonderhede',
    bankLabel: 'Bank',
    accountNumberLabel: 'Rekeningnommer',
    branchCodeLabel: 'Tak kode',
    referenceLabel: 'Verwysing',
    referenceNote: 'Naam en beskrywing (bv. tiende)',
    copyLabel: 'Kopieer rekeningnommer',
    copiedLabel: 'Gekopieer',
    zapperTitle: 'Zapper',
    zapperDesc: 'Betaal jou tiende of offergawe met die Zapper-app.',
    zapperCta: 'Gee via Zapper',
    zapperScan: 'Of skandeer hierdie kode:',
    zapperScanOnly: 'Skandeer hierdie kode met die Zapper-app:',
    zapperQrAlt: 'Zapper QR-kode vir Tygerberg SDA Kerk',
    thanks: 'Baie dankie vir jou getroue ondersteuning.',
    pageTitle: 'Gee · Tygerberg SDA Kerk',
    pageDescription:
      'Ondersteun die bediening van Tygerberg SDA Kerk met ’n tiende of offergawe. Bankbesonderhede vir ’n EFT.',
    pageDescriptionZapper: ' Betaal ook met Zapper.',
  },
  en: {
    backHome: 'Back home',
    eyebrow: 'Give',
    heading: 'Support the ministry',
    sub: 'Tithes and offerings keep the congregation’s ministry going. Use whichever is easiest for you.',
    accountDetailsLabel: 'Banking Details',
    bankLabel: 'Bank',
    accountNumberLabel: 'Account Number',
    branchCodeLabel: 'Branch Code',
    referenceLabel: 'Reference',
    referenceNote: 'Name and description (e.g. tithe)',
    copyLabel: 'Copy account number',
    copiedLabel: 'Copied',
    zapperTitle: 'Zapper',
    zapperDesc: 'Pay your tithe or offering with the Zapper app.',
    zapperCta: 'Give via Zapper',
    zapperScan: 'Or scan this code:',
    zapperScanOnly: 'Scan this code with the Zapper app:',
    zapperQrAlt: 'Zapper QR code for Tygerberg SDA Church',
    thanks: 'Thank you for your faithful support.',
    pageTitle: 'Give · Tygerberg SDA Church',
    pageDescription:
      'Support the ministry of Tygerberg SDA Church with a tithe or offering. Banking details for an EFT.',
    pageDescriptionZapper: ' You can also pay with Zapper.',
  },
};
