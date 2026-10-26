/// <reference types="@cloudflare/workers-types" />

import { type LiveStatusEnv } from './liveStatus';
import { getLiveStatusCached } from './liveStatusCache';
import { getLatestVideoCached, LATEST_VIDEO_CACHE_SECONDS, type LatestVideoEnv } from './latestVideo';
import { handleContact, type ContactEnv } from './contact';
import {
  handleAuthCallback,
  handleAuthLogin,
  handleAuthLogout,
  handleMailSession,
  type AuthEnv,
} from './auth';
import { handleMailSend, type MailSendEnv } from './mailSend';
import { handleInboxList, handleInboxMessage, handleInboxReply, type InboxEnv } from './inbox';
import { healthResponse } from './health';
import { handleInboundEmail, type InboundEmailEnv } from './inboundEmail';
import { requestFacts, requestLogEntry } from './requestLog';

export type Env = LiveStatusEnv &
  LatestVideoEnv &
  ContactEnv &
  InboundEmailEnv &
  AuthEnv &
  MailSendEnv &
  InboxEnv & {
    ASSETS: Fetcher;
  };

/**
 * A headshot master, but not one of the pre-resized copies under `fallback/`.
 * Anchored both ends so nothing deeper than the directory matches.
 */
const HEADSHOT_MASTER = /^\/images\/hod\/([^/]+\.jpe?g)$/i;

/**
 * Serves the static build via the ASSETS binding, plus the API routes.
 *
 * Wrapped rather than inlined so every request — asset hits included, which is
 * what `run_worker_first: ["/*"]` buys — leaves one line naming the connecting
 * address and the outcome. Logged *after* the response so the line carries the
 * status and the wall time; a log that cannot say "4s, 500" is not worth the
 * invocation it costs. See `requestLog.ts` for the shape and C-66 for why every
 * asset request is now a billable Worker invocation.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const started = Date.now();
    const response = await route(request, env, ctx);
    console.log(requestLogEntry(requestFacts(request, response.status, Date.now() - started)));
    return response;
  },

  /**
   * Inbound mail. The zone's catch-all routes every address on
   * sdatygerberg.co.za here; the handler forwards a copy to the church and one
   * to the R2 archive. See `inboundEmail.ts` for why the archive is a second
   * hop through Email Routing — and CONCERNS.md C-65 for the routing this
   * depends on, none of which is visible from this code.
   */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleInboundEmail(message, env);
  },
};

/**
 * The routes themselves. Add a branch here and add its path to `run_worker_first`
 * in wrangler.jsonc — the asset store answers a static hit before this file is
 * ever reached (C-60).
 */
async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

  if (pathname === '/health') {
    // Deployment-health signal: { status: 204, version }. A Worker branch
    // (not a prerendered static file) so the content-type is real JSON, and
    // listed in assets.run_worker_first in wrangler.jsonc or the Worker
    // never sees the request (C-60). Deliberately NOT in the sitemap — it is
    // infrastructure, not a page. C-63
    return healthResponse();
  }

  if (pathname === '/api/contact') {
    return handleContact(request, env);
  }

  if (pathname === '/auth/login') {
    return handleAuthLogin(request, env);
  }

  if (pathname === '/auth/callback') {
    return handleAuthCallback(request, env);
  }

  if (pathname === '/auth/logout') {
    return handleAuthLogout(request);
  }

  if (pathname === '/api/mail/session') {
    return handleMailSession(request, env);
  }

  if (pathname === '/api/mail/send') {
    return handleMailSend(request, env);
  }

  if (pathname === '/api/mail/inbox') {
    return handleInboxList(request, env);
  }

  if (pathname === '/api/mail/message') {
    return handleInboxMessage(request, env);
  }

  if (pathname === '/api/mail/reply') {
    return handleInboxReply(request, env);
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

  if (pathname === '/api/latest-video') {
    // The homepage preview card's data: the newest upload's id and title,
    // resolved server-side so the visitor's browser never asks Google —
    // which is what the embed's consent loop makes impossible (C-60).
    const { video, cached } = await getLatestVideoCached(request, env, ctx);
    return Response.json(
      { video, cached },
      {
        headers: {
          // Unlike live-status this MAY sit in the browser: the newest
          // upload changes weekly, and a stale title costs nothing.
          'Cache-Control': `public, max-age=${LATEST_VIDEO_CACHE_SECONDS / 2}`,
        },
      },
    );
  }

  return env.ASSETS.fetch(request);
}
