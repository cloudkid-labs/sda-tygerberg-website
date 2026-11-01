/// <reference types="@cloudflare/workers-types" />

import { seedEvents, seedHeads, seedPages } from '../lib/cms/seed';
import type { ChurchEvent, DepartmentHead, Page } from '../lib/cms/types';
import type { AuditChange, AuditOrder } from '../lib/cms/auditDiff';
import type { PublicEventPage } from '../lib/cms/types';
import { eventPageSummary } from '../lib/cms/public';

/**
 * The CMS's storage, one R2 bucket (`CMS`, C-70):
 *
 *   content/events.json        { rev, items }   every event, draft and live
 *   content/heads.json         { rev, items }   every department head
 *   pages/draft/<slug>.json    { rev, page }    the working copy of a page
 *   pages/live/<slug>.json     { page }         what /<slug>/ serves
 *   pages/.seeded                               marker: seed pages written once
 *   history/<doc>/<iso>-<r>    previous version before every write (rollback)
 *   audit/<newest-first>-<r>   who changed what, when
 *   media/{heads,pages}/...    processed images, served at /media/...
 *
 * A missing collection document reads as the seed (src/lib/cms/seed.ts), so an
 * empty bucket renders the site exactly as it was hand-coded.
 */

export type CmsStoreEnv = { CMS?: R2Bucket };
export type Doc<T> = { rev: number; items: T[] };
export type PageDoc = { rev: number; page: Page };

export const EVENTS_KEY = 'content/events.json';
export const HEADS_KEY = 'content/heads.json';
export const pageDraftKey = (slug: string) => `pages/draft/${slug}.json`;
export const pageLiveKey = (slug: string) => `pages/live/${slug}.json`;
const SEEDED_MARKER = 'pages/.seeded';

const JSON_META = { httpMetadata: { contentType: 'application/json' } };

export function randomId(bytes = 6): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<{ value: T; etag: string } | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return { value: (await obj.json()) as T, etag: obj.etag };
}

/**
 * Writes `value`, failing (false) if someone else wrote since `etag` was read.
 * Two board members editing at once get a conflict, not a silent overwrite.
 */
async function writeJson(bucket: R2Bucket, key: string, value: unknown, etag: string | null): Promise<boolean> {
  const result = await bucket.put(key, JSON.stringify(value), {
    ...JSON_META,
    ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
  });
  return result !== null;
}

export async function readEvents(bucket: R2Bucket): Promise<{ doc: Doc<ChurchEvent>; etag: string | null }> {
  const hit = await readJson<Doc<ChurchEvent>>(bucket, EVENTS_KEY);
  return hit ? { doc: hit.value, etag: hit.etag } : { doc: { rev: 0, items: seedEvents() }, etag: null };
}

export async function readHeads(bucket: R2Bucket): Promise<{ doc: Doc<DepartmentHead>; etag: string | null }> {
  const hit = await readJson<Doc<DepartmentHead>>(bucket, HEADS_KEY);
  return hit ? { doc: hit.value, etag: hit.etag } : { doc: { rev: 0, items: seedHeads() }, etag: null };
}

/** Keeps the version being replaced, so any publish can be rolled back by hand. */
async function keepHistory(bucket: R2Bucket, name: string, previous: unknown): Promise<void> {
  await bucket.put(`history/${name}/${new Date().toISOString()}-${randomId(3)}.json`, JSON.stringify(previous), JSON_META);
}

export async function writeCollection<T>(
  bucket: R2Bucket,
  key: string,
  previous: Doc<T>,
  next: Doc<T>,
  etag: string | null,
): Promise<boolean> {
  const ok = await writeJson(bucket, key, next, etag);
  if (ok && previous.rev > 0) await keepHistory(bucket, key.replace(/^content\/|\.json$/g, ''), previous);
  return ok;
}

export async function readPageDraft(bucket: R2Bucket, slug: string): Promise<{ doc: PageDoc; etag: string } | null> {
  const hit = await readJson<PageDoc>(bucket, pageDraftKey(slug));
  return hit ? { doc: hit.value, etag: hit.etag } : null;
}

export async function readPageLive(bucket: R2Bucket, slug: string): Promise<Page | null> {
  const hit = await readJson<{ page: Page }>(bucket, pageLiveKey(slug));
  return hit?.value.page ?? null;
}

export async function writePageDraft(
  bucket: R2Bucket,
  previous: PageDoc | null,
  next: PageDoc,
  etag: string | null,
): Promise<boolean> {
  const ok = await writeJson(bucket, pageDraftKey(next.page.slug), next, etag);
  if (ok && previous) await keepHistory(bucket, `pages/${next.page.slug}`, previous);
  return ok;
}

export async function writePageLive(bucket: R2Bucket, page: Page): Promise<void> {
  await bucket.put(pageLiveKey(page.slug), JSON.stringify({ page }), JSON_META);
}

export async function deletePageLive(bucket: R2Bucket, slug: string): Promise<void> {
  await bucket.delete(pageLiveKey(slug));
}

async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function liveSlugs(bucket: R2Bucket): Promise<string[]> {
  return (await listKeys(bucket, 'pages/live/')).map((k) => k.slice('pages/live/'.length, -'.json'.length));
}

/**
 * The homepage's Events list, kept as one object so a homepage request reads
 * one key instead of every live page. Rebuilt from the live pages after each
 * publish and unpublish — a rebuild, not a patch, so a missed write heals on
 * the next one. Newest publish first.
 */
export const EVENT_PAGES_KEY = 'index/event-pages.json';

export async function readEventPages(bucket: R2Bucket): Promise<PublicEventPage[]> {
  return (await readJson<PublicEventPage[]>(bucket, EVENT_PAGES_KEY))?.value ?? [];
}

export async function rebuildEventPages(bucket: R2Bucket): Promise<PublicEventPage[]> {
  const pages = (await Promise.all((await liveSlugs(bucket)).map((s) => readPageLive(bucket, s)))).filter(
    (p): p is Page => Boolean(p?.showInEvents),
  );
  pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const list = pages.map(eventPageSummary);
  await bucket.put(EVENT_PAGES_KEY, JSON.stringify(list), JSON_META);
  return list;
}

/**
 * Every page's working copy. The seed pages are written once, the first time
 * anyone lists pages, so they are ordinary drafts from then on — deleting one
 * does not bring it back.
 */
export async function listPageDrafts(bucket: R2Bucket): Promise<PageDoc[]> {
  let keys = await listKeys(bucket, 'pages/draft/');
  if (keys.length === 0 && !(await bucket.head(SEEDED_MARKER))) {
    for (const page of seedPages()) await writeJson(bucket, pageDraftKey(page.slug), { rev: 1, page }, null);
    await bucket.put(SEEDED_MARKER, new Date().toISOString());
    keys = await listKeys(bucket, 'pages/draft/');
  }
  const docs: PageDoc[] = [];
  for (const key of keys) {
    const hit = await readJson<PageDoc>(bucket, key);
    if (hit) docs.push(hit.value);
  }
  return docs;
}

// ---- Audit ------------------------------------------------------------------

export type AuditEntry = {
  at: string;
  by: string;
  action: string;
  target: string;
  /** Older lines only: a free-text summary, before `changes` existed. */
  detail?: string;
  changes?: AuditChange[];
  /** Move-only saves: the order before and after, to merge back-to-back moves. */
  order?: AuditOrder;
};

/** Newest first under a plain ascending list: the key counts down. */
function auditKey(now: number): string {
  return `audit/${String(9_000_000_000_000_000 - now * 1000).padStart(16, '0')}-${randomId(3)}.json`;
}

export async function audit(bucket: R2Bucket, entry: Omit<AuditEntry, 'at'>): Promise<void> {
  const now = Date.now();
  const record: AuditEntry = { at: new Date(now).toISOString(), ...entry };
  try {
    await bucket.put(auditKey(now), JSON.stringify(record), JSON_META);
  } catch {
    // The change itself already succeeded; a lost audit line is logged, never
    // turned into a failed save.
    console.error(`cms: audit write FAILED action=${entry.action} target=${entry.target}`);
  }
  console.log(`cms: ${entry.action} ${entry.target} by=${entry.by}`);
}

/**
 * One page of the audit log, newest first (the keys count down). `next` is
 * R2's own list cursor, passed back as is for the following page; null when
 * there is no more.
 */
export async function recentAudit(
  bucket: R2Bucket,
  limit = 10,
  cursor?: string,
): Promise<{ items: AuditEntry[]; next: string | null }> {
  const page = await bucket.list({ prefix: 'audit/', limit, ...(cursor ? { cursor } : {}) });
  const hits = await Promise.all(page.objects.map((obj) => readJson<AuditEntry>(bucket, obj.key)));
  const items = hits.filter((h): h is { value: AuditEntry; etag: string } => h !== null).map((h) => h.value);
  return { items, next: page.truncated && page.cursor ? page.cursor : null };
}
