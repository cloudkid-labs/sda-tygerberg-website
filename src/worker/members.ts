/// <reference types="@cloudflare/workers-types" />

import { hasSessionCookie, verifySession, type AuthEnv } from './auth';

export type MembersEnv = AuthEnv & { ASSETS: Fetcher };

const NO_STORE = 'private, no-store';

/** True for `/members`, `/members/` and anything below it. */
export function isMembersPath(pathname: string): boolean {
  return pathname === '/members' || pathname.startsWith('/members/');
}

/** The pre-CMS address of board mail. Old links and bookmarks keep working. */
export function isLegacyBoardPath(pathname: string): boolean {
  return pathname === '/kerkraad' || pathname.startsWith('/kerkraad/');
}

/** /kerkraad[/...]?msg=x → /members/?msg=x — board mail is the default tab. */
export function legacyBoardRedirect(request: Request): Response {
  const { search } = new URL(request.url);
  return new Response(null, {
    status: 301,
    headers: { Location: `/members/${search}`, 'Cache-Control': NO_STORE },
  });
}

/** The static /no-access/ page, answered as a 403. */
export async function noAccess(request: Request, env: MembersEnv): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL('/no-access/', request.url), request));
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', NO_STORE);
  return new Response(page.body, { status: 403, headers });
}

/**
 * Serves /members only to a signed-in board member. The HTML holds no data —
 * every API re-checks the session itself — but the brief is that a
 * non-member reaches no /members route at all, so the page is gated too.
 *
 * - no session cookie, or sign-in not configured → /login/
 * - a cookie that fails (expired, tampered, or the account left the
 *   allow-list) → 403 page
 * - a valid session → the page, never cached
 */
export async function membersGate(request: Request, env: MembersEnv): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.ok) {
    if (session.outcome === 'not-configured' || !hasSessionCookie(request)) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/login/', 'Cache-Control': NO_STORE },
      });
    }
    return noAccess(request, env);
  }
  const page = await env.ASSETS.fetch(request);
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', NO_STORE);
  return new Response(page.body, { status: page.status, headers });
}
