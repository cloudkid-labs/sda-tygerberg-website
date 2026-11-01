/// <reference types="@cloudflare/workers-types" />

import { verifySession, type AuthEnv } from './auth';
import {
  audit,
  deletePageLive,
  EVENTS_KEY,
  HEADS_KEY,
  listPageDrafts,
  liveSlugs,
  readEvents,
  readHeads,
  readPageDraft,
  readPageLive,
  recentAudit,
  writeCollection,
  writePageDraft,
  writePageLive,
  type CmsStoreEnv,
  type Doc,
} from './cmsStore';
import { handleMediaUpload, type MediaEnv } from './cmsMedia';
import { STATIC_PAGE_SLUGS, validateEvents, validateHeads, validatePage, isValidSlug } from '../lib/cms/validate';
import type { ChurchEvent, DepartmentHead, Page } from '../lib/cms/types';
import { diffEvents, diffHeads, diffPage } from '../lib/cms/auditDiff';

/**
 * /api/cms/* — the members area's content API (C-70).
 *
 * Every route, reads included, re-checks the session and the allow-list
 * through `verifySession`, exactly like /api/mail/*. Writes also require a
 * same-origin JSON request. Drafts and audit fields leave only through here,
 * and only to a signed-in board member.
 */

export type CmsEnv = AuthEnv & CmsStoreEnv & MediaEnv;

const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

type Gate = { ok: true; email: string; bucket: R2Bucket } | { ok: false; response: Response };

async function gate(request: Request, env: CmsEnv): Promise<Gate> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    return {
      ok: false,
      response: json({ ok: false, outcome: session.outcome }, session.outcome === 'not-configured' ? 503 : 401),
    };
  }
  if (!env.CMS) return { ok: false, response: json({ ok: false, outcome: 'not-configured' }, 503) };
  return { ok: true, email: session.email, bucket: env.CMS };
}

/** Same-origin JSON only — a cross-site form cannot reach a write. */
async function readBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const origin = request.headers.get('origin') ?? '';
  const type = request.headers.get('content-type') ?? '';
  if (origin !== new URL(request.url).origin || !type.includes('application/json')) {
    return { ok: false, response: json({ ok: false, outcome: 'invalid', errors: ['origin'] }, 403) };
  }
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
    return { ok: false, response: json({ ok: false, outcome: 'invalid', errors: ['body'] }, 413) };
  }
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return { ok: false, response: json({ ok: false, outcome: 'invalid', errors: ['body'] }, 413) };
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: json({ ok: false, outcome: 'invalid', errors: ['body'] }, 400) };
  }
}

/** JSON with keys sorted, so field order never reads as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The fields that make two versions of an item "the same edit". */
function contentOf(item: object): string {
  const { updatedBy: _b, updatedAt: _a, order: _o, ...rest } = item as Record<string, unknown>;
  return canonical(rest);
}

type Stamped = { id: string; updatedBy: string; updatedAt: string };

/**
 * Stamps who and when on every item whose content changed; untouched items
 * keep their stamps. Reports what changed for the audit line.
 */
export function stampItems<T extends Stamped>(
  incoming: Omit<T, 'updatedBy' | 'updatedAt'>[],
  previous: T[],
  by: string,
  at: string,
): { items: T[]; added: string[]; changed: string[]; removed: string[]; reordered: boolean } {
  const before = new Map(previous.map((p) => [p.id, p]));
  const added: string[] = [];
  const changed: string[] = [];
  const items = incoming.map((item) => {
    const old = before.get(item.id);
    if (!old) added.push(item.id);
    else if (contentOf(old) !== contentOf(item)) changed.push(item.id);
    else return { ...item, updatedBy: old.updatedBy, updatedAt: old.updatedAt } as T;
    return { ...item, updatedBy: by, updatedAt: at } as T;
  });
  const now = new Set(items.map((i) => i.id));
  const removed = previous.filter((p) => !now.has(p.id)).map((p) => p.id);
  const kept = previous.filter((p) => now.has(p.id)).map((p) => p.id);
  const reordered = kept.join() !== items.filter((i) => before.has(i.id)).map((i) => i.id).join();
  return { items, added, changed, removed, reordered };
}

// ---- Events -------------------------------------------------------------------

async function eventsRoute(request: Request, env: CmsEnv, g: { email: string; bucket: R2Bucket }): Promise<Response> {
  if (request.method === 'GET') {
    const { doc } = await readEvents(g.bucket);
    return json({ ok: true, rev: doc.rev, items: doc.items }, 200);
  }
  if (request.method !== 'PUT') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const checked = validateEvents(body.body.items);
  if (!checked.ok) return json({ ok: false, outcome: 'invalid', errors: checked.errors }, 400);

  // A live card may only link to a page a visitor can open.
  const linkable = new Set([...STATIC_PAGE_SLUGS, ...(await liveSlugs(g.bucket))]);
  const deadLinks = checked.value
    .map((e, i) => (e.status === 'live' && e.link && !linkable.has(e.link.pageSlug) ? `items.${i}.link.pageSlug` : ''))
    .filter(Boolean);
  if (deadLinks.length) return json({ ok: false, outcome: 'invalid', errors: deadLinks }, 400);

  const { doc, etag } = await readEvents(g.bucket);
  if (body.body.rev !== doc.rev) return json({ ok: false, outcome: 'conflict', rev: doc.rev }, 409);
  const stamped = stampItems<ChurchEvent>(checked.value, doc.items, g.email, new Date().toISOString());
  const next: Doc<ChurchEvent> = { rev: doc.rev + 1, items: stamped.items };
  if (!(await writeCollection(g.bucket, EVENTS_KEY, doc, next, etag))) {
    return json({ ok: false, outcome: 'conflict', rev: doc.rev }, 409);
  }
  // The audit line names each change; a save that changed nothing is not one.
  const changes = diffEvents(doc.items, next.items);
  if (changes.length) await audit(g.bucket, { by: g.email, action: 'events.save', target: 'events', changes });
  return json({ ok: true, rev: next.rev, items: next.items }, 200);
}

// ---- Department heads ---------------------------------------------------------

async function headsRoute(request: Request, env: CmsEnv, g: { email: string; bucket: R2Bucket }): Promise<Response> {
  if (request.method === 'GET') {
    const { doc } = await readHeads(g.bucket);
    return json({ ok: true, rev: doc.rev, items: doc.items }, 200);
  }
  if (request.method !== 'PUT') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  const body = await readBody(request);
  if (!body.ok) return body.response;
  const checked = validateHeads(body.body.items);
  if (!checked.ok) return json({ ok: false, outcome: 'invalid', errors: checked.errors }, 400);
  const { doc, etag } = await readHeads(g.bucket);
  if (body.body.rev !== doc.rev) return json({ ok: false, outcome: 'conflict', rev: doc.rev }, 409);
  const stamped = stampItems<DepartmentHead>(checked.value, doc.items, g.email, new Date().toISOString());
  const next: Doc<DepartmentHead> = { rev: doc.rev + 1, items: stamped.items };
  if (!(await writeCollection(g.bucket, HEADS_KEY, doc, next, etag))) {
    return json({ ok: false, outcome: 'conflict', rev: doc.rev }, 409);
  }
  const changes = diffHeads(doc.items, next.items);
  if (changes.length) await audit(g.bucket, { by: g.email, action: 'heads.publish', target: 'heads', changes });
  return json({ ok: true, rev: next.rev, items: next.items }, 200);
}

// ---- Pages ----------------------------------------------------------------------

function pageSummary(page: Page, live: boolean) {
  return { slug: page.slug, title: page.title, status: live ? 'live' : 'draft', updatedBy: page.updatedBy, updatedAt: page.updatedAt };
}

/** True when the working copy differs from what /<slug>/ serves. */
function isDirty(draft: Page, live: Page | null): boolean {
  if (!live) return true;
  const strip = ({ status: _s, updatedBy: _b, updatedAt: _a, ...rest }: Page) => canonical(rest);
  return strip(draft) !== strip(live);
}

async function pagesRoute(request: Request, env: CmsEnv, g: { email: string; bucket: R2Bucket }): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const slug = url.searchParams.get('slug');
    if (slug) {
      if (!isValidSlug(slug)) return json({ ok: false, outcome: 'invalid', errors: ['slug'] }, 400);
      const draft = await readPageDraft(g.bucket, slug);
      if (!draft) return json({ ok: false, outcome: 'invalid', errors: ['slug'] }, 404);
      const live = await readPageLive(g.bucket, slug);
      return json({ ok: true, rev: draft.doc.rev, page: draft.doc.page, live, dirty: isDirty(draft.doc.page, live) }, 200);
    }
    const docs = await listPageDrafts(g.bucket);
    const live = new Set(await liveSlugs(g.bucket));
    return json({ ok: true, items: docs.map((d) => pageSummary(d.page, live.has(d.page.slug))) }, 200);
  }
  if (request.method !== 'PUT') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  const body = await readBody(request);
  if (!body.ok) return body.response;

  if (body.body.action === 'unpublish') {
    const slug = body.body.slug;
    if (!isValidSlug(slug)) return json({ ok: false, outcome: 'invalid', errors: ['slug'] }, 400);
    const draft = await readPageDraft(g.bucket, slug);
    if (!draft) return json({ ok: false, outcome: 'invalid', errors: ['slug'] }, 404);
    // A live This week card pointing here would link to a 404 — the same rule
    // the events route enforces from the other side.
    const { doc: events } = await readEvents(g.bucket);
    if (events.items.some((e) => e.status === 'live' && e.link?.pageSlug === slug)) {
      return json({ ok: false, outcome: 'invalid', errors: ['linked'] }, 409);
    }
    await deletePageLive(g.bucket, slug);
    const page: Page = { ...draft.doc.page, status: 'draft', updatedBy: g.email, updatedAt: new Date().toISOString() };
    await writePageDraft(g.bucket, draft.doc, { rev: draft.doc.rev + 1, page }, draft.etag);
    await audit(g.bucket, { by: g.email, action: 'page.unpublish', target: `/${slug}/` });
    return json({ ok: true, rev: draft.doc.rev + 1, page, live: null, dirty: true }, 200);
  }

  const checked = validatePage(body.body.page);
  if (!checked.ok) return json({ ok: false, outcome: 'invalid', errors: checked.errors }, 400);
  const slug = checked.value.slug;
  const existing = await readPageDraft(g.bucket, slug);
  const rev = body.body.rev;
  if (rev === 0 && existing) return json({ ok: false, outcome: 'invalid', errors: ['slug-taken'] }, 409);
  if (rev !== 0 && (!existing || existing.doc.rev !== rev)) {
    return json({ ok: false, outcome: 'conflict', rev: existing?.doc.rev ?? 0 }, 409);
  }

  const publish = body.body.publish === true;
  const live = existing ? await readPageLive(g.bucket, slug) : null;
  const now = new Date().toISOString();
  const page: Page = {
    ...checked.value,
    status: publish || live ? 'live' : 'draft',
    updatedBy: g.email,
    updatedAt: now,
  };
  const next = { rev: (existing?.doc.rev ?? 0) + 1, page };
  if (!(await writePageDraft(g.bucket, existing?.doc ?? null, next, existing?.etag ?? null))) {
    return json({ ok: false, outcome: 'conflict', rev: existing?.doc.rev ?? 0 }, 409);
  }
  if (publish) await writePageLive(g.bucket, page);
  // A publish reports what visitors will now see differently (against the
  // live copy); a draft save reports what changed since the last draft.
  const changes = publish ? diffPage(live, page) : diffPage(existing?.doc.page ?? null, page);
  if (publish || !existing || changes.length) {
    await audit(g.bucket, {
      by: g.email,
      action: publish ? 'page.publish' : existing ? 'page.save' : 'page.create',
      target: `/${slug}/`,
      ...(changes.length ? { changes } : {}),
    });
  }
  const nowLive = publish ? page : live;
  return json({ ok: true, rev: next.rev, page, live: nowLive, dirty: isDirty(page, nowLive) }, 200);
}

/** Every /api/cms/* request. */
export async function handleCms(request: Request, env: CmsEnv): Promise<Response> {
  const g = await gate(request, env);
  if (!g.ok) return g.response;
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case '/api/cms/events':
      return eventsRoute(request, env, g);
    case '/api/cms/heads':
      return headsRoute(request, env, g);
    case '/api/cms/pages':
      return pagesRoute(request, env, g);
    case '/api/cms/media':
      return handleMediaUpload(request, env, g);
    case '/api/cms/audit':
      if (request.method !== 'GET') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
      return json({ ok: true, items: await recentAudit(g.bucket) }, 200);
    default:
      return json({ ok: false, outcome: 'invalid', errors: ['path'] }, 404);
  }
}
