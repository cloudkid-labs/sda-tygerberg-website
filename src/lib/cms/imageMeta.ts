/**
 * Image sniffing, dimensions and metadata stripping for CMS uploads (C-70).
 * Pure byte work, no decoding — cheap enough for a Worker on any plan.
 *
 * Stripping removes what can identify a person or a place: EXIF (camera,
 * GPS, timestamps), XMP, IPTC and comments. It keeps what changes how the
 * pixels look: JFIF, the ICC colour profile, Adobe's colour-transform flag.
 */

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

function ascii(bytes: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + len));
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** ArrayBuffer-backed, so the result can go straight to crypto.subtle or R2. */
export type Bytes = Uint8Array<ArrayBuffer>;

function concat(parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** APP0 JFIF, APP2 ICC and APP14 Adobe stay; every other APPn and COM goes. */
function keepJpegMarker(marker: number): boolean {
  if (marker === 0xfe) return false; // COM
  if (marker >= 0xe0 && marker <= 0xef) return marker === 0xe0 || marker === 0xe2 || marker === 0xee;
  return true;
}

function stripJpeg(bytes: Uint8Array): Bytes {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('jpeg: lost sync');
    let m = i + 1;
    while (bytes[m] === 0xff) m++; // fill bytes
    const marker = bytes[m];
    if (marker === 0xda) {
      // Start of scan: entropy-coded data to the end, copied untouched.
      parts.push(bytes.subarray(i));
      return concat(parts);
    }
    const len = u16be(bytes, m + 1);
    const end = m + 1 + len;
    if (len < 2 || end > bytes.length) throw new Error('jpeg: bad segment length');
    if (keepJpegMarker(marker)) parts.push(bytes.subarray(i, end));
    i = end;
  }
  throw new Error('jpeg: no image data');
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Uint8Array): Bytes {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const len = u32be(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + len;
    if (end > bytes.length) throw new Error('png: bad chunk length');
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return concat(parts);
  }
  throw new Error('png: no IEND');
}

function stripWebp(bytes: Uint8Array): Bytes {
  const chunks: Uint8Array[] = [];
  let i = 12;
  let vp8x = -1;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, 4);
    const len = u32le(bytes, i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > bytes.length) throw new Error('webp: bad chunk length');
    if (type !== 'EXIF' && type !== 'XMP ') {
      if (type === 'VP8X') vp8x = chunks.length;
      chunks.push(bytes.slice(i, Math.min(end, bytes.length)));
    }
    i = end;
  }
  if (vp8x >= 0) chunks[vp8x][8] &= ~(0x08 | 0x04); // clear the EXIF and XMP flags
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  const size = body.length + 4;
  header[4] = size & 0xff;
  header[5] = (size >> 8) & 0xff;
  header[6] = (size >> 16) & 0xff;
  header[7] = (size >> 24) & 0xff;
  return concat([header, body]);
}

/** The same image without identifying metadata. Throws on a malformed file. */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Bytes {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}

/** True when any EXIF/XMP/IPTC/comment block is present. For tests and checks. */
export function hasIdentifyingMetadata(bytes: Uint8Array, type: ImageType): boolean {
  try {
    return stripImageMetadata(bytes, type).length !== bytes.length;
  } catch {
    return true;
  }
}

export function imageSize(bytes: Uint8Array, type: ImageType): { width: number; height: number } | null {
  try {
    if (type === 'image/png') return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    if (type === 'image/jpeg') {
      let i = 2;
      while (i + 9 < bytes.length) {
        let m = i + 1;
        while (bytes[m] === 0xff) m++;
        const marker = bytes[m];
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { height: u16be(bytes, m + 4), width: u16be(bytes, m + 6) };
        if (marker === 0xda) return null;
        i = m + 1 + u16be(bytes, m + 1);
      }
      return null;
    }
    let i = 12;
    while (i + 8 <= bytes.length) {
      const kind = ascii(bytes, i, 4);
      const len = u32le(bytes, i + 4);
      const d = i + 8;
      if (kind === 'VP8X') return { width: u24le(bytes, d + 4) + 1, height: u24le(bytes, d + 7) + 1 };
      if (kind === 'VP8 ') return { width: (bytes[d + 6] | (bytes[d + 7] << 8)) & 0x3fff, height: (bytes[d + 8] | (bytes[d + 9] << 8)) & 0x3fff };
      if (kind === 'VP8L') {
        const bits = u32le(bytes, d + 1);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      i = d + len + (len % 2);
    }
    return null;
  } catch {
    return null;
  }
}
