/// <reference types="@cloudflare/workers-types" />

export type TurnstileEnv = {
  /**
   * The Turnstile secret key, as a Worker secret (`wrangler secret put
   * TURNSTILE_SECRET_KEY`). Unset means no human check — local dev and devtest,
   * where the contact route is unconfigured anyway. Set means every submission
   * without a valid token is rejected before delivery. CONCERNS.md C-21.
   *
   * The site key is the public half and never arrives here; the client reads it
   * at build time from `PUBLIC_TURNSTILE_SITE_KEY` and posts the token back as
   * `cf-turnstile-response`.
   */
  TURNSTILE_SECRET_KEY?: string;

  /**
   * Comma-separated hostnames siteverify must echo back (the host the widget
   * was solved on). Tokens minted on any other domain are refused — the site
   * key is public, so this is what stops a third-party page from minting
   * passing tokens. Unset or empty disables the hostname check. C-21.
   */
  TURNSTILE_HOSTNAMES?: string;
};

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;

/**
 * Binds a token to the surface that requested it. The widget renders with
 * `action: 'contact'` (RequestForm.tsx) and siteverify echoes it back — a
 * token minted for any other surface is refused here. Keep the two literals
 * in step; nothing in the type system connects them.
 */
export const TURNSTILE_ACTION = 'contact';

/** Tokens are short opaque strings; anything longer is not a token. */
const MAX_TOKEN_LENGTH = 2048;

/**
 * The token the widget posts. Implicit renders name it
 * `cf-turnstile-response`; the explicit path in RequestForm posts the same
 * name, and `turnstileToken` is accepted as an alias so a crafted client using
 * the documented generic name is not rejected for the wrong field.
 */
export function turnstileTokenFrom(body: Record<string, unknown>): string {
  const raw = body['cf-turnstile-response'] ?? body['turnstileToken'];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** One token against Cloudflare's siteverify. False on any refusal or fault. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteip?: string,
  allowedHostnames?: string[],
): Promise<boolean> {
  if (!token || !secret || token.length > MAX_TOKEN_LENGTH) return false;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (remoteip) form.append('remoteip', remoteip);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    if (data.success !== true || data.action !== TURNSTILE_ACTION) return false;
    // Fail closed where a list is configured: a token solved on a domain the
    // operator never approved is exactly what the check exists to catch.
    // Unset or empty keeps the check off — today's behaviour.
    if (allowedHostnames && allowedHostnames.length > 0) {
      if (!data.hostname || !allowedHostnames.includes(data.hostname)) return false;
    }
    return true;
  } catch {
    // Timeout, DNS, TLS, non-JSON — indistinguishable from a refusal here, and
    // failing open would turn every Cloudflare blip into a spam window. C-21.
    return false;
  }
}

/**
 * The human check for handleContact. Returns `null` where no secret is set —
 * not a verdict, so the caller skips the check entirely and behaviour there is
 * exactly what it was before Turnstile existed.
 */
export async function checkTurnstile(
  request: Request,
  body: Record<string, unknown>,
  env: TurnstileEnv,
): Promise<boolean | null> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  const token = turnstileTokenFrom(body);
  if (!token) return false;
  const remoteip = request.headers.get('cf-connecting-ip') ?? undefined;
  const hostnames = (env.TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return verifyTurnstile(token, secret, remoteip, hostnames);
}
