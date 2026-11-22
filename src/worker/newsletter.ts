import { verifyTurnstile } from './turnstile';

export type NewsletterEnv = {
  NEWSLETTER_BREVO_API_KEY?: string;
  NEWSLETTER_LIST_ID?: string;
  NEWSLETTER_TEMPLATE_ID?: string;
  NEWSLETTER_REDIRECT_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
};

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function handleNewsletter(request: Request, env: NewsletterEnv): Promise<Response> {
  const list = Number(env.NEWSLETTER_LIST_ID);
  const template = Number(env.NEWSLETTER_TEMPLATE_ID);
  const configured = !!(env.NEWSLETTER_BREVO_API_KEY && Number.isSafeInteger(list) && list > 0 && Number.isSafeInteger(template) && template > 0 && env.NEWSLETTER_REDIRECT_URL && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_HOSTNAMES);
  if (request.method === 'GET') return json({ enabled: configured });
  if (request.method !== 'POST') return json({ ok: false }, 405);
  if (!configured) return json({ ok: false }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ ok: false }, 400);
  const raw = await request.text();
  if (raw.length > 4096) return json({ ok: false }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  if (!body || typeof body !== 'object' || typeof body.email !== 'string' || typeof body.token !== 'string' || body.consent !== true) return json({ ok: false }, 400);
  const email = body.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false }, 400);
  const hosts = env.TURNSTILE_HOSTNAMES!.split(',').map((s) => s.trim()).filter(Boolean);
  if (!hosts.length || !(await verifyTurnstile(body.token, env.TURNSTILE_SECRET_KEY!, request.headers.get('cf-connecting-ip') ?? undefined, hosts, 'newsletter'))) return json({ ok: false }, 400);
  try {
    const response = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: { 'api-key': env.NEWSLETTER_BREVO_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({ email, includeListIds: [list], templateId: template, redirectionUrl: env.NEWSLETTER_REDIRECT_URL }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json({ ok: false }, 502);
    return json({ ok: true });
  } catch { return json({ ok: false }, 502); }
}
