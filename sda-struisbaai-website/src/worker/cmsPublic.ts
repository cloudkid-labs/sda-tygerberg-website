/// <reference types="@cloudflare/workers-types" />

import { homePayload, publicPage, scriptJson } from '../lib/cms/public';
import { johannesburgDate } from '../lib/cms/time';
import { HOME_PAYLOAD_ID, PAGE_PAYLOAD_ID } from '../lib/cms/ids';
import type { ChurchEvent, DepartmentHead, HomePayload, Page, PublicEventPage, PublicPage } from '../lib/cms/types';
import { liveSlugs, readEventPages, readEvents, readHeads, readPageLive, type CmsStoreEnv } from './cmsStore';

/**
 * Where live CMS content meets the static build (C-70).
 *
 * The site stays `output: 'static'`. For the homepage and for CMS pages the
 * Worker takes the built HTML and swaps in, per request:
 *
 *  1. the JSON payload the island reads on hydration, and
 *  2. the HTML of the sections that payload drives, rendered by the same
 *     React components (cmsRender.tsx).
 *
 * Both change together or not at all: if anything fails, the built page is
 * served untouched — the seed, which is self-consistent. Drafts never reach
 * here; `public.ts` filters them before the payload exists.
 *
 * String surgery rather than HTMLRewriter: the pages are tens of KB, the
 * boundaries are elements the build itself emits, and a pure function is one
 * the test suite can run.
 */

export type Renderers = {
  week: (p: HomePayload) => string;
  events: (p: HomePayload) => string;
  about: (p: HomePayload) => string;
  page: (p: PublicPage) => string;
};

/** [start, end) of the element whose opening tag matches `open`, nesting-aware. */
export function findElement(html: string, open: RegExp, tag: string): [number, number] | null {
  const m = open.exec(html);
  if (!m) return null;
  const start = m.index;
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let hit = re.exec(html); hit; hit = re.exec(html)) {
    depth += hit[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return [start, hit.index + hit[0].length];
  }
  return null;
}

function replaceRange(html: string, [start, end]: [number, number], content: string): string {
  return html.slice(0, start) + content + html.slice(end);
}

function payloadRange(html: string, id: string): { open: [number, number]; body: [number, number] } | null {
  const m = new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const close = html.indexOf('</script>', bodyStart);
  if (close < 0) return null;
  return { open: [m.index, bodyStart], body: [bodyStart, close] };
}

/**
 * The homepage with live events and heads, or null to serve the build as is.
 * `build` is read back from the page so the Worker renders with the same
 * flags the build did.
 */
export function rewriteHome(
  html: string,
  live: { events: ChurchEvent[]; heads: DepartmentHead[]; eventPages?: PublicEventPage[] },
  asOf: string,
  render: Pick<Renderers, 'week' | 'events' | 'about'>,
): string | null {
  const script = payloadRange(html, HOME_PAYLOAD_ID);
  if (!script) return null;
  let built: HomePayload;
  try {
    built = JSON.parse(html.slice(...script.body)) as HomePayload;
  } catch {
    return null;
  }
  const payload = homePayload(live.events, live.heads, asOf, built.build, live.eventPages ?? []);

  const week = findElement(html, /<section id="week"/, 'section');
  const events = findElement(html, /<section id="geleenthede"/, 'section');
  const about = findElement(html, /<section id="oor"/, 'section');
  if (!week || !events || !about) return null;
  const weekHtml = render.week(payload);
  const eventsHtml = render.events(payload);
  const aboutHtml = render.about(payload);

  // Back to front, so earlier offsets stay valid.
  const edits: [[number, number], string][] = [
    [script.body, scriptJson(payload)],
    [week, weekHtml],
    [events, eventsHtml],
    [about, aboutHtml],
  ];
  edits.sort((a, b) => b[0][0] - a[0][0]);
  let out = html;
  for (const [range, content] of edits) out = replaceRange(out, range, content);
  return out;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The page shell (/page-shell/) filled with one live page, or null. */
export function rewritePage(html: string, page: Page, render: Pick<Renderers, 'page'>): string | null {
  const pub = publicPage(page);
  const script = payloadRange(html, PAGE_PAYLOAD_ID);
  const root = findElement(html, /<div id="cms-page-root"/, 'div');
  if (!script || !root) return null;

  const title = `${pub.title.af} · SDA Struisbaai`;
  const description = pub.intro.af || pub.title.af;
  const path = `/${pub.slug}/`;
  const edits: [[number, number], string][] = [
    [script.body, scriptJson({ page: pub })],
    [root, render.page(pub)],
  ];
  edits.sort((a, b) => b[0][0] - a[0][0]);
  let out = html;
  for (const [range, content] of edits) out = replaceRange(out, range, content);

  // Head tags: the shell's own values are placeholders built for /page-shell/.
  out = out
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeText(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(description)}$2`)
    .replace(/(<link rel="canonical" href="https?:\/\/[^/"]+)\/page-shell\/(")/, `$1${path}$2`)
    .replace(/(<meta property="og:url" content="https?:\/\/[^/"]+)\/page-shell\/(")/, `$1${path}$2`);
  return out;
}

/** The asset response's headers for HTML we rewrote: no stale validators. */
function rewrittenHeaders(source: Response): Headers {
  const headers = new Headers(source.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.delete('last-modified');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return headers;
}

/** An unconditional request for the built asset — a 304 has no body to rewrite. */
export function unconditional(request: Request, pathname: string): Request {
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  return new Request(new URL(pathname, request.url), { method: 'GET', headers });
}

export type PublicEnv = CmsStoreEnv & { ASSETS: Fetcher };

/** GET / — the built homepage with live events and heads swapped in. */
export async function serveHome(
  request: Request,
  env: PublicEnv,
  render: Pick<Renderers, 'week' | 'events' | 'about'>,
  now = new Date(),
): Promise<Response> {
  const asset = await env.ASSETS.fetch(env.CMS ? unconditional(request, '/') : request);
  if (!env.CMS || request.method !== 'GET' || asset.status !== 200) return asset;
  try {
    const [{ doc: events }, { doc: heads }, eventPages] = await Promise.all([readEvents(env.CMS), readHeads(env.CMS), readEventPages(env.CMS)]);
    const html = await asset.clone().text();
    const out = rewriteHome(html, { events: events.items, heads: heads.items, eventPages }, johannesburgDate(now), render);
    if (out === null) {
      console.error('cms: homepage markers missing — serving the build');
      return asset;
    }
    return new Response(out, { status: 200, headers: rewrittenHeaders(asset) });
  } catch (err) {
    console.error(`cms: homepage render FAILED — serving the build: ${(err as Error).message}`);
    return asset;
  }
}

const PAGE_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/**
 * A path the static build has no file for: a live CMS page, or nothing (null,
 * and the caller serves the 404 it already has). Drafts are never read here.
 */
export async function serveCmsPage(
  request: Request,
  env: PublicEnv,
  render: Pick<Renderers, 'page'>,
): Promise<Response | null> {
  if (!env.CMS || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  const url = new URL(request.url);
  const m = PAGE_PATH.exec(url.pathname);
  if (!m) return null;
  const page = await readPageLive(env.CMS, m[1]);
  if (!page) return null;
  if (!url.pathname.endsWith('/')) {
    return new Response(null, { status: 301, headers: { Location: `/${m[1]}/${url.search}` } });
  }
  const shell = await env.ASSETS.fetch(unconditional(request, '/page-shell/'));
  if (shell.status !== 200) return null;
  const out = rewritePage(await shell.text(), page, render);
  if (out === null) {
    console.error('cms: page shell markers missing');
    return null;
  }
  return new Response(request.method === 'HEAD' ? null : out, { status: 200, headers: rewrittenHeaders(shell) });
}

/** The sitemap with every live CMS page appended. Production build only. */
export async function serveSitemap(request: Request, env: PublicEnv): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  if (!env.CMS || asset.status !== 200) return asset;
  try {
    const slugs = await liveSlugs(env.CMS);
    if (slugs.length === 0) return asset;
    const xml = await asset.clone().text();
    const origin = /<loc>(https?:\/\/[^/<]+)\//.exec(xml)?.[1];
    if (!origin || !xml.includes('</urlset>')) return asset;
    const entries = slugs.map((s) => `<url><loc>${origin}/${s}/</loc><priority>0.5</priority></url>`).join('');
    const headers = new Headers(asset.headers);
    headers.delete('content-length');
    headers.delete('etag');
    return new Response(xml.replace('</urlset>', `${entries}</urlset>`), { status: 200, headers });
  } catch {
    return asset;
  }
}
