import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNewsletter } from '../src/worker/newsletter.ts';

const env = { BREVO_API_KEY: 'secret', NEWSLETTER_LIST_ID: '3', TURNSTILE_SECRET_KEY: 'turnstile', TURNSTILE_HOSTNAMES: 'sdatygerberg.co.za' };
const post = (body) => new Request('https://sdatygerberg.co.za/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('hidden and unavailable until configured', async () => {
  assert.deepEqual(await (await handleNewsletter(new Request('https://example.org/api/newsletter'), {})).json(), { enabled: false });
  assert.equal((await handleNewsletter(post({}), {})).status, 503);
});

test('validates consent and requires a newsletter-specific Turnstile token', async () => {
  assert.equal((await handleNewsletter(post({ email: 'test@example.org', consent: false, token: 'x' }), env)).status, 400);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ success: true, action: 'contact', hostname: 'sdatygerberg.co.za' });
    assert.equal((await handleNewsletter(post({ email: 'test@example.org', consent: true, token: 'x' }), env)).status, 400);
  } finally { globalThis.fetch = original; }
});

test('adds the contact to the configured Brevo list', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      if (url.includes('siteverify')) return Response.json({ success: true, action: 'newsletter', hostname: 'sdatygerberg.co.za' });
      assert.equal(url, 'https://api.brevo.com/v3/contacts');
      assert.deepEqual(JSON.parse(options.body), { email: 'test@example.org', listIds: [3], updateEnabled: true });
      return new Response(null, { status: 201 });
    };
    assert.equal((await handleNewsletter(post({ email: 'test@example.org', consent: true, token: 'x' }), env)).status, 200);
  } finally { globalThis.fetch = original; }
});

test('does not claim success when Brevo fails', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => url.includes('siteverify')
      ? Response.json({ success: true, action: 'newsletter', hostname: 'sdatygerberg.co.za' })
      : new Response(null, { status: 500 });
    assert.equal((await handleNewsletter(post({ email: 'test@example.org', consent: true, token: 'x' }), env)).status, 502);
  } finally { globalThis.fetch = original; }
});

test('an existing contact can be added without resetting its email blocklist status', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      if (url.includes('siteverify')) return Response.json({ success: true, action: 'newsletter', hostname: 'sdatygerberg.co.za' });
      const payload = JSON.parse(options.body);
      assert.equal(payload.updateEnabled, true);
      assert.equal(Object.hasOwn(payload, 'emailBlacklisted'), false);
      return new Response(null, { status: 204 });
    };
    assert.equal((await handleNewsletter(post({ email: 'test@example.org', consent: true, token: 'x' }), env)).status, 200);
  } finally { globalThis.fetch = original; }
});
