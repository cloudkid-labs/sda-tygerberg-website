import {
  BLOCK_TYPES,
  WEEKDAYS_AF,
  type Block,
  type ChurchEvent,
  type DepartmentHead,
  type L10n,
  type Page,
} from './types';

/**
 * Server-side validation for everything the CMS API accepts. The editor
 * mirrors these limits, but this is the boundary: the Worker never trusts
 * what a browser sends, signed in or not.
 *
 * Each validator returns the cleaned value or the list of field paths that
 * failed. Audit fields are not accepted from the client — the Worker stamps
 * them from the session.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Paths that are, or may become, real routes. A CMS page can never take one —
 * it would shadow a static page or an API. Every directory and file under
 * src/pages must appear here; test/cmsValidate.test.mjs checks that.
 */
export const RESERVED_SLUGS = new Set([
  '404',
  '_astro',
  'admin',
  'api',
  'auth',
  'beliefs',
  'bible-studies',
  'blood-bank',
  'cdn-cgi',
  'connect',
  'favicon',
  'giving',
  'health',
  'images',
  'index',
  'kerkraad',
  'llms',
  'login',
  'logos',
  'map',
  'media',
  'members',
  'no-access',
  'og-image',
  'page-shell',
  'privacy',
  'robots',
  'sitemap',
  'staging',
  'terms',
  'youth',
]);

/** Static pages an event card may link to, besides live CMS pages. */
export const STATIC_PAGE_SLUGS = new Set(['beliefs', 'bible-studies', 'blood-bank', 'connect', 'giving', 'map', 'youth']);

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d – ([01]\d|2[0-3]):[0-5]\d$/;

export const LIMITS = {
  events: 40,
  heads: 60,
  positions: 6,
  blocks: 30,
  listItems: 12,
  slots: 12,
  short: 80,
  medium: 160,
  long: 2000,
} as const;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= 60 && SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** `/connect/`, `/pastoral-counselling/#x`, or an https URL. Never `javascript:`. */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 300) return false;
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?#=&%]*$/.test(href)) return true;
  try {
    const url = new URL(href);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

class Checker {
  errors: string[] = [];

  str(value: unknown, path: string, max: number, required = true): string {
    if (typeof value !== 'string') {
      this.errors.push(path);
      return '';
    }
    const v = value.trim();
    if ((required && !v) || v.length > max) this.errors.push(path);
    return v;
  }

  l10n(value: unknown, path: string, max: number, required = true): L10n {
    const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    if (!value || typeof value !== 'object') this.errors.push(path);
    return { af: this.str(o.af, `${path}.af`, max, required), en: this.str(o.en, `${path}.en`, max, required) };
  }

  list<T>(value: unknown, path: string, max: number, each: (v: unknown, p: string) => T, min = 0): T[] {
    if (!Array.isArray(value) || value.length > max || value.length < min) {
      this.errors.push(path);
      return [];
    }
    return value.map((v, i) => each(v, `${path}.${i}`));
  }
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type Unstamped<T> = Omit<T, 'updatedBy' | 'updatedAt'>;

export function validateEvent(input: unknown, path = 'event'): Result<Unstamped<ChurchEvent>> {
  const c = new Checker();
  const o = obj(input);
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : (c.errors.push(`${path}.id`), '');
  const kind = o.kind === 'weekly' || o.kind === 'once' ? o.kind : (c.errors.push(`${path}.kind`), 'weekly');
  const event: Unstamped<ChurchEvent> = {
    id,
    kind,
    start: typeof o.start === 'string' && TIME_RE.test(o.start) ? o.start : (c.errors.push(`${path}.start`), ''),
    end: typeof o.end === 'string' && TIME_RE.test(o.end) ? o.end : (c.errors.push(`${path}.end`), ''),
    name: c.l10n(o.name, `${path}.name`, LIMITS.short),
    where: c.l10n(o.where, `${path}.where`, LIMITS.medium, false),
    order: 0,
    status: o.status === 'live' ? 'live' : o.status === 'draft' ? 'draft' : (c.errors.push(`${path}.status`), 'draft'),
  };
  if (event.start && event.end && event.end <= event.start) c.errors.push(`${path}.end`);
  if (kind === 'weekly') {
    if ((WEEKDAYS_AF as readonly unknown[]).includes(o.day)) event.day = o.day as ChurchEvent['day'];
    else c.errors.push(`${path}.day`);
  } else if (isIsoDate(o.date)) {
    event.date = o.date;
  } else {
    c.errors.push(`${path}.date`);
  }
  if (o.link !== undefined && o.link !== null) {
    const link = obj(o.link);
    const pageSlug =
      typeof link.pageSlug === 'string' && SLUG_RE.test(link.pageSlug) ? link.pageSlug : (c.errors.push(`${path}.link.pageSlug`), '');
    event.link = { pageSlug, label: c.l10n(link.label, `${path}.link.label`, 40) };
  }
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: event };
}

export function validateEvents(input: unknown): Result<Unstamped<ChurchEvent>[]> {
  if (!Array.isArray(input) || input.length > LIMITS.events) return { ok: false, errors: ['items'] };
  const out: Unstamped<ChurchEvent>[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  input.forEach((item, i) => {
    const r = validateEvent(item, `items.${i}`);
    if (!r.ok) errors.push(...r.errors);
    else if (ids.has(r.value.id)) errors.push(`items.${i}.id`);
    else {
      ids.add(r.value.id);
      // Order is the list position, always — never trusted from the client.
      out.push({ ...r.value, order: i });
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/** Where a head's photo may point: a seeded headshot or a CMS upload. */
const PHOTO_SRC_RE = /^\/(?:images\/hod\/[A-Za-z0-9._-]+\.jpe?g|media\/heads\/[a-z0-9-]+\.jpg)$/;

export function validateHeads(input: unknown): Result<Unstamped<DepartmentHead>[]> {
  if (!Array.isArray(input) || input.length > LIMITS.heads) return { ok: false, errors: ['items'] };
  const c = new Checker();
  const ids = new Set<string>();
  const out = input.map((item, i): Unstamped<DepartmentHead> => {
    const p = `items.${i}`;
    const o = obj(item);
    const id = typeof o.id === 'string' && ID_RE.test(o.id) && !ids.has(o.id) ? o.id : (c.errors.push(`${p}.id`), '');
    ids.add(id);
    const head: Unstamped<DepartmentHead> = {
      id,
      name: c.str(o.name, `${p}.name`, LIMITS.short),
      positions: c.list(o.positions, `${p}.positions`, LIMITS.positions, (v, q) => c.l10n(v, q, LIMITS.short), 1),
      visible: o.visible === true,
      order: i,
    };
    if (o.photo !== undefined && o.photo !== null) {
      const photo = obj(o.photo);
      const src = typeof photo.src === 'string' && PHOTO_SRC_RE.test(photo.src) ? photo.src : (c.errors.push(`${p}.photo.src`), '');
      head.photo = { src, alt: c.str(photo.alt, `${p}.photo.alt`, 120, false) || head.name };
    }
    return head;
  });
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: out };
}

function validateBlock(input: unknown, path: string, c: Checker): Block | null {
  const o = obj(input);
  const S = LIMITS.short;
  const M = LIMITS.medium;
  const L = LIMITS.long;
  switch (o.type) {
    case 'infoCard':
      return {
        type: 'infoCard',
        label: c.l10n(o.label, `${path}.label`, S),
        big: c.l10n(o.big, `${path}.big`, S),
        where: c.l10n(o.where, `${path}.where`, M, false),
        note: c.l10n(o.note, `${path}.note`, M, false),
      };
    case 'cardGrid':
      return {
        type: 'cardGrid',
        heading: c.l10n(o.heading, `${path}.heading`, S, false),
        intro: c.l10n(o.intro, `${path}.intro`, M, false),
        cards: c.list(o.cards, `${path}.cards`, LIMITS.listItems, (v, q) => {
          const card = obj(v);
          return {
            label: c.l10n(card.label, `${q}.label`, S, false),
            title: c.l10n(card.title, `${q}.title`, S),
            text: c.l10n(card.text, `${q}.text`, M, false),
          };
        }, 1),
      };
    case 'timeSlots':
      return {
        type: 'timeSlots',
        day: c.l10n(o.day, `${path}.day`, S),
        title: c.l10n(o.title, `${path}.title`, S),
        slots: c.list(o.slots, `${path}.slots`, LIMITS.slots, (v, q) => {
          if (typeof v !== 'string' || !SLOT_RE.test(v.trim())) c.errors.push(q);
          return typeof v === 'string' ? v.trim() : '';
        }, 1),
      };
    case 'text':
      return {
        type: 'text',
        heading: c.l10n(o.heading, `${path}.heading`, S, false),
        body: c.l10n(o.body, `${path}.body`, L),
      };
    case 'faq':
      return {
        type: 'faq',
        items: c.list(o.items, `${path}.items`, LIMITS.listItems, (v, q) => {
          const item = obj(v);
          return { q: c.l10n(item.q, `${q}.q`, M), a: c.l10n(item.a, `${q}.a`, L) };
        }, 1),
      };
    case 'image': {
      const src = typeof o.src === 'string' && /^\/media\/pages\/[a-z0-9-]+\.jpg$/.test(o.src) ? o.src : (c.errors.push(`${path}.src`), '');
      return { type: 'image', src, alt: c.l10n(o.alt, `${path}.alt`, M), caption: c.l10n(o.caption, `${path}.caption`, M, false) };
    }
    case 'contactForm':
      if (o.topic !== 'connect' && o.topic !== 'bible-study') c.errors.push(`${path}.topic`);
      return { type: 'contactForm', topic: o.topic === 'bible-study' ? 'bible-study' : 'connect' };
    case 'callout': {
      const block: Block = {
        type: 'callout',
        heading: c.l10n(o.heading, `${path}.heading`, S),
        text: c.l10n(o.text, `${path}.text`, M, false),
      };
      if (o.button !== undefined && o.button !== null) {
        const button = obj(o.button);
        if (!isSafeHref(button.href)) c.errors.push(`${path}.button.href`);
        block.button = { label: c.l10n(button.label, `${path}.button.label`, 40), href: String(button.href ?? '') };
      }
      return block;
    }
    default:
      c.errors.push(`${path}.type`);
      return null;
  }
}

export function validatePage(input: unknown): Result<Omit<Page, 'status' | 'updatedBy' | 'updatedAt'>> {
  const c = new Checker();
  const o = obj(input);
  const slug = isValidSlug(o.slug) ? o.slug : (c.errors.push('slug'), '');
  const blocks: Block[] = [];
  if (!Array.isArray(o.blocks) || o.blocks.length > LIMITS.blocks) c.errors.push('blocks');
  else {
    o.blocks.forEach((b, i) => {
      const block = validateBlock(b, `blocks.${i}`, c);
      if (block) blocks.push(block);
    });
  }
  const page = {
    slug,
    title: c.l10n(o.title, 'title', LIMITS.short),
    eyebrow: c.l10n(o.eyebrow, 'eyebrow', LIMITS.short, false),
    intro: c.l10n(o.intro, 'intro', 400, false),
    blocks,
    ...(o.showInEvents === true ? { showInEvents: true } : {}),
  };
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: page };
}

export { BLOCK_TYPES };
