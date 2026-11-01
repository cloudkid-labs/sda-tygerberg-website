import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';
import { r2Mock } from './r2Mock.mjs';
import { hasIdentifyingMetadata, imageSize, sniffImage, stripImageMetadata } from '../src/lib/cms/imageMeta.ts';
import { handleMediaUpload, serveMedia, transformOptions, MEDIA_SIZES } from '../src/worker/cmsMedia.ts';

/*
 * Headshot uploads (C-70): JPG/PNG up to 5 MB, metadata stripped before the
 * original is even staged, cropped to exactly 4:5 by the zone's transformer,
 * checked and stripped again, and the staged original deleted.
 */

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];

function jpeg(width, height, { exif = true } = {}) {
  const jfif = seg(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  // A GPS-bearing EXIF block, as a phone camera writes one.
  const exifSeg = seg(0xe1, [...ascii('Exif\0\0'), 0x4d, 0x4d, 0, 42, ...ascii('GPS -33.8974 18.6235')]);
  const comment = seg(0xfe, ascii('taken by someone'));
  const icc = seg(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, 9, 9]);
  const sof = seg(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = [0xff, 0xda, 0, 12, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0];
  return Uint8Array.from([0xff, 0xd8, ...jfif, ...(exif ? [...exifSeg, ...comment] : []), ...icc, ...sof, ...sos, 1, 2, 3, 4, 0xff, 0xd9]);
}

function webp(w, h, { exif = true } = {}) {
  const le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const chunk = (type, data) => [...ascii(type), ...le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
  const vp8x = chunk('VP8X', [exif ? 0x08 : 0, 0, 0, 0, ...le(w - 1).slice(0, 3), ...le(h - 1).slice(0, 3)]);
  const vp8 = chunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, (w >> 8) & 0x3f, h & 255, (h >> 8) & 0x3f]);
  const body = [...ascii('WEBP'), ...vp8x, ...vp8, ...(exif ? chunk('EXIF', [...ascii('MM\0*'), 1, 2, 3]) : [])];
  return Uint8Array.from([...ascii('RIFF'), ...le(body.length), ...body]);
}

describe('metadata stripping', () => {
  test('JPEG: EXIF and comments go; JFIF, ICC and the image stay', () => {
    const src = jpeg(4000, 6000);
    assert.equal(hasIdentifyingMetadata(src, 'image/jpeg'), true);
    const out = stripImageMetadata(src, 'image/jpeg');
    assert.equal(hasIdentifyingMetadata(out, 'image/jpeg'), false);
    const text = String.fromCharCode(...out);
    assert.doesNotMatch(text, /Exif|GPS|taken by/);
    assert.match(text, /JFIF/);
    assert.match(text, /ICC_PROFILE/);
    assert.deepEqual(imageSize(out, 'image/jpeg'), { width: 4000, height: 6000 });
    assert.deepEqual([...out.slice(-6)], [1, 2, 3, 4, 0xff, 0xd9], 'scan data untouched');
  });

  test('WebP: EXIF chunk and flag go, the size header is rewritten', () => {
    const out = stripImageMetadata(webp(1280, 1600), 'image/webp');
    assert.equal(hasIdentifyingMetadata(out, 'image/webp'), false);
    assert.equal(sniffImage(out), 'image/webp');
    assert.deepEqual(imageSize(out, 'image/webp'), { width: 1280, height: 1600 });
    const riff = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    assert.equal(riff, out.length - 8);
  });

  test('sniffing is by bytes, never by the declared type', () => {
    assert.equal(sniffImage(ascii('GIF89a')), null);
    assert.equal(sniffImage(jpeg(1, 1)), 'image/jpeg');
  });
});

describe('upload', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const ORIGIN = 'https://x';
  const upload = (bytes, query = 'kind=head&id=diakens', headers = {}) =>
    new Request(`${ORIGIN}/api/cms/media?${query}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'image/jpeg', ...headers },
      body: bytes,
    });

  function transformer(bucket, { width = 1280, height = 1600 } = {}) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const staged = bucket.bytes(`staging/${new URL(url).pathname.split('/').pop()}`);
      calls.push({ url, image: init.cf.image, stagedHasExif: hasIdentifyingMetadata(staged, sniffImage(staged)) });
      // The transformer answers with metadata still in, to prove the Worker
      // strips its output too rather than trusting `metadata: 'none'`.
      return new Response(init.cf.image.format === 'webp' ? webp(width, height) : jpeg(width, height));
    };
    return calls;
  }

  test('a phone photo comes out 1280×1600, 4:5, with no EXIF anywhere', async () => {
    const bucket = r2Mock();
    const calls = transformer(bucket);
    const res = await handleMediaUpload(upload(jpeg(4000, 6000)), { CMS: bucket }, { email: 'boss@example.co.za', bucket });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.src, /^\/media\/heads\/diakens-[0-9a-f]{10}\.jpg$/);

    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => !c.stagedHasExif), 'the original was stripped before staging');
    assert.deepEqual(calls.map((c) => c.image.format), ['jpeg', 'webp']);
    for (const c of calls) {
      assert.equal(c.image.fit, 'cover');
      assert.equal(c.image.metadata, 'none');
      assert.equal(c.image.width / c.image.height, 4 / 5);
    }

    const jpg = bucket.bytes(`media${body.src.slice('/media'.length)}`);
    const wp = bucket.bytes(`media${body.webp.slice('/media'.length)}`);
    assert.deepEqual(imageSize(jpg, 'image/jpeg'), { width: 1280, height: 1600 });
    assert.deepEqual(imageSize(wp, 'image/webp'), { width: 1280, height: 1600 });
    assert.equal(hasIdentifyingMetadata(jpg, 'image/jpeg'), false);
    assert.equal(hasIdentifyingMetadata(wp, 'image/webp'), false);
    assert.ok(!bucket.keys().some((k) => k.startsWith('staging/')), 'staged original deleted');
    assert.ok(bucket.keys().some((k) => k.startsWith('audit/')));
  });

  test('a transformer that did not crop (wrangler dev, or a fault) stores nothing', async () => {
    const bucket = r2Mock();
    transformer(bucket, { width: 4000, height: 6000 });
    const res = await handleMediaUpload(upload(jpeg(4000, 6000)), { CMS: bucket }, { email: 'b', bucket });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).outcome, 'transform-unavailable');
    assert.deepEqual(bucket.keys(), []);
  });

  test('over 5 MB, not an image, wrong origin, bad id: refused before anything is stored', async () => {
    const bucket = r2Mock();
    transformer(bucket);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(jpeg(10, 10));
    const g = { email: 'b', bucket };
    assert.equal((await handleMediaUpload(upload(big), { CMS: bucket }, g)).status, 413);
    assert.equal((await handleMediaUpload(upload(Uint8Array.from(ascii('GIF89a....'))), { CMS: bucket }, g)).status, 415);
    assert.equal((await handleMediaUpload(upload(jpeg(10, 10), 'kind=head&id=diakens', { origin: 'https://evil' }), { CMS: bucket }, g)).status, 403);
    assert.equal((await handleMediaUpload(upload(jpeg(10, 10), 'kind=head&id=../x'), { CMS: bucket }, g)).status, 400);
    assert.deepEqual(bucket.keys(), []);
  });

  test('page images are 16:9', () => {
    const o = transformOptions('page', 'jpeg', 0.5);
    assert.deepEqual([o.width, o.height], [MEDIA_SIZES.page.width, MEDIA_SIZES.page.height]);
    assert.equal(o.width / o.height, 16 / 9);
  });
});

describe('/media/', () => {
  test('a processed image is public and immutable; staging answers only the transformer', async () => {
    const bucket = r2Mock();
    await bucket.put('media/heads/a-1.jpg', jpeg(2, 2, { exif: false }), { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' } });
    await bucket.put('staging/abc.jpg', jpeg(2, 2, { exif: false }), { httpMetadata: { contentType: 'image/jpeg' } });
    const ok = await serveMedia(new Request('https://x/media/heads/a-1.jpg'), { CMS: bucket });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('cache-control'), /immutable/);
    assert.equal(await serveMedia(new Request('https://x/media/staging/abc.jpg'), { CMS: bucket }), null);
    const viaTransformer = await serveMedia(new Request('https://x/media/staging/abc.jpg', { headers: { via: '1.1 image-resizing' } }), { CMS: bucket });
    assert.equal(viaTransformer.status, 200);
    assert.equal(await serveMedia(new Request('https://x/media/../content/events.json'), { CMS: bucket }), null);
  });
});
