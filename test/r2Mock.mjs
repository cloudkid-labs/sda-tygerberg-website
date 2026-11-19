/**
 * An in-memory R2 bucket: enough of get/put/head/list/delete, conditional
 * puts and httpMetadata for the CMS tests. Not a test file itself.
 */
export function r2Mock() {
  const store = new Map();
  let etagSeq = 0;
  const toBytes = async (value) => {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new Uint8Array(await new Response(value).arrayBuffer());
  };
  const objectOf = (key, entry) => ({
    key,
    etag: entry.etag,
    httpEtag: `"${entry.etag}"`,
    size: entry.bytes.length,
    httpMetadata: entry.httpMetadata,
    get body() {
      return new Response(entry.bytes).body;
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(entry.bytes));
    },
    async text() {
      return new TextDecoder().decode(entry.bytes);
    },
    async arrayBuffer() {
      return entry.bytes.slice().buffer;
    },
    writeHttpMetadata(headers) {
      if (entry.httpMetadata?.contentType) headers.set('Content-Type', entry.httpMetadata.contentType);
      if (entry.httpMetadata?.cacheControl) headers.set('Cache-Control', entry.httpMetadata.cacheControl);
    },
  });
  return {
    store,
    keys: () => [...store.keys()].sort(),
    bytes: (key) => store.get(key)?.bytes,
    async get(key) {
      const entry = store.get(key);
      return entry ? objectOf(key, entry) : null;
    },
    async head(key) {
      const entry = store.get(key);
      return entry ? objectOf(key, entry) : null;
    },
    async put(key, value, opts = {}) {
      const bytes = await toBytes(value);
      // Check-and-set with no await between, mirroring R2's atomic conditional
      // put: concurrent create-only claims must let exactly one win.
      const current = store.get(key);
      if (opts.onlyIf?.etagMatches && current?.etag !== opts.onlyIf.etagMatches) return null;
      const dnm = opts.onlyIf?.etagDoesNotMatch;
      if (dnm && current && (dnm === '*' || current.etag === dnm)) return null;
      const entry = { bytes, etag: `e${++etagSeq}`, httpMetadata: opts.httpMetadata ?? {} };
      store.set(key, entry);
      return objectOf(key, entry);
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      const truncated = start + limit < all.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + limit) : undefined };
    },
  };
}
