import type { Lang } from './site';

// Real EFT banking details supplied by the church board.
export const BANKING_DETAILS = {
  organisation: 'Sewendedag Adventiste Kerk Tygerberg Gemeente',
  bank: 'ABSA',
  accountNumber: '1450750251',
  branchCode: '632005',
};

/**
 * Zapper, the second giving option.
 *
 * `qr` is a file in `public/images/`, filename only — the church's own code,
 * which scans to a payload naming "SDA Tygerberg Gemeente" with the reference
 * "Offergawe Tygerberg". Regenerate it from the church's Zapper account, never
 * by hand.
 *
 * `url` is a tap-to-pay link and is **deliberately empty**. The church's QR
 * encodes `http://2.zap.pe?t=6&i=...`, which cannot be used as a link here:
 *
 *   - It is plain `http`, and the site is served over `https`. Linking out to
 *     an insecure scheme for a *payment* is a downgrade no giving page should
 *     make.
 *   - `2.zap.pe` is not `zapper.com`, so the deep-link manifests that make a
 *     Zapper link open the app — the apple-app-site-association and
 *     assetlinks.json published for `zapper.com` — do not cover it. A tap would
 *     have no reason to reach the app.
 *   - The payload carries `|` and `[`, which a browser percent-encodes on
 *     navigation. Whether Zapper still parses it after that is unknown.
 *
 * A code that scans is worth more than a button that might not work, so the
 * page ships the QR alone. To add the button, get a current `https://zapper.com`
 * payment link from the merchant portal and put it here — the section renders
 * it automatically. **Do not guess that link.** A wrong one sends people's
 * giving to a stranger's merchant account, and nothing on the page would look
 * wrong.
 *
 * The section hides itself when both are empty, so clearing them unpublishes
 * Zapper rather than shipping a broken card — same approach as the first-visit
 * answers in homeCopy.ts.
 */
export const ZAPPER: { url: string; qr: string } = {
  url: '',
  qr: 'zapper-qr.png',
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
