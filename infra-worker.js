const HOST = "infra.sdatygerberg.co.za";

function response(body, status, method, headers = {}) {
  const out = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    ...headers,
  });
  return new Response(method === "HEAD" ? null : body, { status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== HOST) return response("Not found", 404, request.method, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    if (request.method !== "GET" && request.method !== "HEAD") return response("Method Not Allowed", 405, request.method, { "Allow": "GET, HEAD", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    if (url.pathname !== "/" && url.pathname !== "/index.html") return response("Not found", 404, request.method, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    const asset = await env.ASSETS.fetch(new Request(new URL("/index.html", url), { method: "GET" }));
    if (!asset.ok) return response("Not found", 404, request.method, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return response(await asset.text(), 200, request.method, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
  },
};
