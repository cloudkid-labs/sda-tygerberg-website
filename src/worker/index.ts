/// <reference types="@cloudflare/workers-types" />

import { type LiveStatusEnv } from './liveStatus';
import { getLiveStatusCached } from './liveStatusCache';
import { handleContact, type ContactEnv } from './contact';

export type Env = LiveStatusEnv &
  ContactEnv & {
    ASSETS: Fetcher;
  };

/**
 * A headshot master, but not one of the pre-resized copies under `fallback/`.
 * Anchored both ends so nothing deeper than the directory matches.
 */
const HEADSHOT_MASTER = /^\/images\/hod\/([^/]+\.jpe?g)$/i;

/**
 * Serves the static build via the ASSETS binding, plus the API routes. Add new
 * ones as branches here, or split into src/worker/routes/* as they grow.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    /*
     * C-02 says the masters "exist to be Cloudflare's transform source and
     * nothing else". That was true of every path the site's own markup takes
     * and false of the plain URL, which answered 200 with a ~9 MB 21-megapixel
     * portrait — EXIF intact, filenames right there in the srcset.
     *
     * Cloudflare marks its own transform subrequest with `image-resizing` in
     * Via. Anything without that marker gets the 1400px fallback instead.
     *
     * A rewrite, not a 404, and that choice is the safety margin: if the marker
     * ever does not arrive, the transformer reads the fallback as its source
     * rather than an error page. The widest srcset candidate is 1280 and the
     * fallback is 1400 wide, so a transform built from it is the same picture.
     * Nothing can break here — the bad case only costs a little sharpness.
     *
     * Not a security boundary: `Via` is a request header and anyone can send
     * it. It closes the accidental door — browsers, crawlers, anyone reading
     * the srcset — and the real fix is moving the masters off the public
     * origin entirely. C-51
     */
    const master = HEADSHOT_MASTER.exec(pathname);
    if (master && !/image-resizing/i.test(request.headers.get('via') ?? '')) {
      const rewritten = new URL(request.url);
      rewritten.pathname = `/images/hod/fallback/${master[1]}`;
      return env.ASSETS.fetch(new Request(rewritten, request));
    }

    if (pathname === '/api/contact') {
      return handleContact(request, env);
    }

    if (pathname === '/api/live-status') {
      // One upstream call shared by every viewer in the colo — CONCERNS.md C-16.
      const { result, cached } = await getLiveStatusCached(request, env, ctx);
      return Response.json(
        { ...result, cached },
        {
          headers: {
            // The *browser* still never caches: the sharing happens edge-side,
            // where it can be bounded, and a pinned badge in someone's tab
            // could not be.
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    return env.ASSETS.fetch(request);
  },
};
