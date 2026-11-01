/// <reference types="@cloudflare/workers-types" />

import { imageSize, sniffImage, stripImageMetadata, type Bytes, type ImageType } from '../lib/cms/imageMeta';
import { audit, randomId, readHeads } from './cmsStore';

/**
 * CMS image uploads and their public URLs (C-70).
 *
 * An upload (JPG/PNG, at most 5 MB) is sniffed by its bytes, stripped of
 * identifying metadata, and parked under an unguessable `staging/` key. The
 * Worker then asks the zone's Image Transformations — the same service the
 * headshots already use (C-02…C-10), not a new one — for a cover-crop at the
 * target size, once as JPEG and once as WebP, with `metadata: 'none'`. Each
 * result is checked to be exactly that size and stripped again before it is
 * stored under `media/`; the staged original is deleted either way. No
 * original with its EXIF is kept anywhere.
 *
 * The transformer reaches the staged file through this Worker, which serves
 * `staging/` only to requests carrying Cloudflare's `image-resizing` Via
 * marker — the C-51 pattern. Not a security boundary on its own; the random
 * key and the immediate delete are.
 */

export type MediaEnv = { CMS?: R2Bucket };

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 4:5 for headshots (C-04: at least the widest srcset entry, 1280), 16:9 for page images. */
export const MEDIA_SIZES = {
  head: { width: 1280, height: 1600 },
  page: { width: 1600, height: 900 },
} as const;

type Kind = keyof typeof MEDIA_SIZES;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function shortHash(bytes: Bytes): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.subarray(0, 5)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The transformer's request, separated so tests can see exactly what is asked. */
export function transformOptions(kind: Kind, format: 'jpeg' | 'webp', focusY: number): RequestInitCfPropertiesImage {
  const { width, height } = MEDIA_SIZES[kind];
  return {
    width,
    height,
    fit: 'cover',
    gravity: { x: 0.5, y: focusY },
    format,
    quality: 85,
    metadata: 'none',
  };
}

async function transform(
  stagedUrl: string,
  kind: Kind,
  format: 'jpeg' | 'webp',
  focusY: number,
): Promise<Bytes | null> {
  const res = await fetch(stagedUrl, { cf: { image: transformOptions(kind, format, focusY) } });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const type = sniffImage(bytes);
  const want: ImageType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  if (type !== want) return null;
  const size = imageSize(bytes, type);
  const { width, height } = MEDIA_SIZES[kind];
  // No transformer (wrangler dev --local), or one that did not crop: refuse
  // rather than store an image of the wrong shape.
  if (!size || size.width !== width || size.height !== height) return null;
  return stripImageMetadata(bytes, type);
}

/** POST /api/cms/media?kind=head|page[&id=<head id>][&focus=0..1] — raw image body. */
export async function handleMediaUpload(
  request: Request,
  env: MediaEnv,
  g: { email: string; bucket: R2Bucket },
): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) {
    return json({ ok: false, outcome: 'invalid', errors: ['origin'] }, 403);
  }
  const kind = url.searchParams.get('kind');
  if (kind !== 'head' && kind !== 'page') return json({ ok: false, outcome: 'invalid', errors: ['kind'] }, 400);
  const id = url.searchParams.get('id') ?? '';
  if (kind === 'head' && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    return json({ ok: false, outcome: 'invalid', errors: ['id'] }, 400);
  }
  const focusParam = Number(url.searchParams.get('focus') ?? '0.3');
  const focusY = Number.isFinite(focusParam) ? Math.min(1, Math.max(0, focusParam)) : 0.3;

  if (Number(request.headers.get('content-length') ?? '0') > MAX_UPLOAD_BYTES) {
    return json({ ok: false, outcome: 'invalid', errors: ['size'] }, 413);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ ok: false, outcome: 'invalid', errors: ['size'] }, 413);
  const type = sniffImage(bytes);
  if (type !== 'image/jpeg' && type !== 'image/png') {
    return json({ ok: false, outcome: 'invalid', errors: ['type'] }, 415);
  }

  let clean: Bytes;
  try {
    clean = stripImageMetadata(bytes, type);
  } catch {
    return json({ ok: false, outcome: 'invalid', errors: ['type'] }, 415);
  }

  const stagedName = `${randomId(16)}.${type === 'image/png' ? 'png' : 'jpg'}`;
  await g.bucket.put(`staging/${stagedName}`, clean, { httpMetadata: { contentType: type } });
  const stagedUrl = `${url.origin}/media/staging/${stagedName}`;
  try {
    const jpeg = await transform(stagedUrl, kind, 'jpeg', focusY);
    const webp = jpeg ? await transform(stagedUrl, kind, 'webp', focusY) : null;
    if (!jpeg || !webp) {
      console.error(`cms: media transform unavailable kind=${kind}`);
      return json({ ok: false, outcome: 'transform-unavailable' }, 502);
    }
    const base = `${kind === 'head' ? `heads/${id}` : `pages/${randomId(4)}`}-${await shortHash(jpeg)}`;
    const cache = { httpMetadata: { cacheControl: 'public, max-age=31536000, immutable' } };
    await g.bucket.put(`media/${base}.jpg`, jpeg, { httpMetadata: { ...cache.httpMetadata, contentType: 'image/jpeg' } });
    await g.bucket.put(`media/${base}.webp`, webp, { httpMetadata: { ...cache.httpMetadata, contentType: 'image/webp' } });
    // Name the person the photo is for; a head not yet published has no name
    // on record, so its id stands in.
    const who = kind === 'head' ? (await readHeads(g.bucket)).doc.items.find((h) => h.id === id)?.name || id : '';
    await audit(g.bucket, { by: g.email, action: 'media.upload', target: who || `/media/${base}.jpg` });
    const { width, height } = MEDIA_SIZES[kind];
    return json({ ok: true, src: `/media/${base}.jpg`, webp: `/media/${base}.webp`, width, height }, 200);
  } finally {
    await g.bucket.delete(`staging/${stagedName}`);
  }
}

/**
 * GET /media/... — processed images, public, immutable (content-hashed
 * names). `staging/` answers only Cloudflare's own transform subrequest.
 */
export async function serveMedia(request: Request, env: MediaEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const m = /^\/media\/((?:heads|pages|staging)\/[a-z0-9-]+\.(?:jpg|png|webp))$/.exec(pathname);
  if (!m || !env.CMS) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const key = m[1];
  if (key.startsWith('staging/') && !/image-resizing/i.test(request.headers.get('via') ?? '')) return null;
  const obj = await env.CMS.get(`media/${key}`.replace(/^media\/staging\//, 'staging/'));
  if (!obj) return null;
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  if (key.startsWith('staging/')) headers.set('Cache-Control', 'no-store');
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
}
