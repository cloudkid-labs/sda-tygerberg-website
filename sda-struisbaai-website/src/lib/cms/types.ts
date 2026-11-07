/**
 * The CMS content model (C-70). Every visitor-facing string is a pair, so the
 * language toggle has something to switch to; Afrikaans is the default.
 *
 * `updatedBy` holds a board member's personal Google address. It lives in R2
 * and in the members area only — the public payload builders in `public.ts`
 * strip it, along with drafts, before anything reaches a page.
 */

export type L10n = { af: string; en: string };

export const WEEKDAYS_AF = ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Sabbat'] as const;
export type WeekdayAf = (typeof WEEKDAYS_AF)[number];

export type ChurchEvent = {
  id: string;
  kind: 'weekly' | 'once';
  /** Weekly only. */
  day?: WeekdayAf;
  /** Once-off only, ISO yyyy-mm-dd. Hidden from the day after (Johannesburg). */
  date?: string;
  /** HH:mm */
  start: string;
  end: string;
  name: L10n;
  where: L10n;
  /** The card gets the orange top border and "Sien meer →". */
  link?: { pageSlug: string; label: L10n };
  order: number;
  status: 'draft' | 'live';
  updatedBy: string;
  updatedAt: string;
};

export type DepartmentHead = {
  id: string;
  /** Verbatim, never "corrected". */
  name: string;
  positions: L10n[];
  photo?: { src: string; alt: string };
  visible: boolean;
  order: number;
  updatedBy: string;
  updatedAt: string;
};

// ---- Page blocks: the Template artboard's library ---------------------------

export type InfoCardBlock = { type: 'infoCard'; label: L10n; big: L10n; where: L10n; note: L10n };
export type CardGridBlock = {
  type: 'cardGrid';
  heading: L10n;
  intro: L10n;
  cards: { label: L10n; title: L10n; text: L10n }[];
};
export type TimeSlotsBlock = {
  type: 'timeSlots';
  /** The orange label, e.g. the weekday. */
  day: L10n;
  /** The serif line, e.g. the date. */
  title: L10n;
  /** "13:00 – 13:45" each. */
  slots: string[];
};
export type TextBlock = { type: 'text'; heading: L10n; body: L10n };
export type FaqBlock = { type: 'faq'; items: { q: L10n; a: L10n }[] };
export type ImageBlock = { type: 'image'; src: string; alt: L10n; caption: L10n };
/**
 * The existing enquiry form. Where it delivers is decided by the topic in the
 * Worker (/api/contact), never by page content — no editable recipient.
 */
export type ContactFormBlock = { type: 'contactForm'; topic: 'connect' | 'bible-study' };
export type CalloutBlock = { type: 'callout'; heading: L10n; text: L10n; button?: { label: L10n; href: string } };

export type Block =
  | InfoCardBlock
  | CardGridBlock
  | TimeSlotsBlock
  | TextBlock
  | FaqBlock
  | ImageBlock
  | ContactFormBlock
  | CalloutBlock;

export type BlockType = Block['type'];
export const BLOCK_TYPES: BlockType[] = [
  'infoCard',
  'cardGrid',
  'timeSlots',
  'text',
  'faq',
  'image',
  'contactForm',
  'callout',
];

export type Page = {
  /** /<slug>/ — unique, kebab-case, never a reserved path. */
  slug: string;
  title: L10n;
  eyebrow: L10n;
  intro: L10n;
  blocks: Block[];
  /** Listed in the homepage's Events section (#geleenthede) while live. */
  showInEvents?: boolean;
  status: 'draft' | 'live';
  updatedBy: string;
  updatedAt: string;
};

// ---- What a visitor's page receives ------------------------------------------

export type PublicEvent = Omit<ChurchEvent, 'status' | 'updatedBy' | 'updatedAt'>;
export type PublicHead = Omit<DepartmentHead, 'updatedBy' | 'updatedAt' | 'visible'> & {
  photo: { src: string; alt: string };
};
export type PublicPage = Omit<Page, 'status' | 'updatedBy' | 'updatedAt'>;

/**
 * What the build bakes into the page and the Worker replaces per request.
 * `build` is read back by the Worker so its render uses the same flags the
 * static build did — the Worker cannot see build-time env.
 */
/** A live page as the homepage's Events section lists it. */
export type PublicEventPage = { slug: string; title: L10n; eyebrow: L10n; intro: L10n };

export type HomePayload = {
  asOf: string;
  build: { imageCdn: boolean };
  events: PublicEvent[];
  heads: PublicHead[];
  eventPages: PublicEventPage[];
};

export type PagePayload = { page: PublicPage };
