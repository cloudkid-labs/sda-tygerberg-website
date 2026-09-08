import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import {
  turnstileTokenFrom,
  verifyTurnstile,
  checkTurnstile,
} from '../src/worker/turnstile.ts';

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('turnstileTokenFrom', () => {
  test('reads the widget field name', () => {
    assert.equal(turnstileTokenFrom({ 'cf-turnstile-response': 'tok123' }), 'tok123');
  });

  test('accepts turnstileToken as an alias', () => {
    assert.equal(turnstileTokenFrom({ turnstileToken: 'tok123' }), 'tok123');
  });

  test('prefers the widget field when both are present', () => {
    assert.equal(
      turnstileTokenFrom({ 'cf-turnstile-response': 'widget', turnstileToken: 'alias' }),
      'widget',
    );
  });

  test('trims and rejects non-strings', () => {
    assert.equal(turnstileTokenFrom({ 'cf-turnstile-response': '  tok123  ' }), 'tok123');
    assert.equal(turnstileTokenFrom({}), '');
    assert.equal(turnstileTokenFrom({ 'cf-turnstile-response': 42 }), '');
    assert.equal(turnstileTokenFrom({ 'cf-turnstile-response': null }), '');
  });
});

describe('verifyTurnstile', () => {
  test('false without calling siteverify when token or secret is empty', async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return new Response('{}');
    };
    assert.equal(await verifyTurnstile('', 'secret'), false);
    assert.equal(await verifyTurnstile('tok', ''), false);
    assert.equal(called, 0);
  });

  test('true on siteverify success, posting secret and response', async () => {
    let seen;
    globalThis.fetch = async (_url, init) => {
      seen = init?.body;
      return Response.json({ success: true, action: 'contact' });
    };
    assert.equal(await verifyTurnstile('tok123', 's3cret', '203.0.113.7'), true);
    assert.equal(seen.get('secret'), 's3cret');
    assert.equal(seen.get('response'), 'tok123');
    assert.equal(seen.get('remoteip'), '203.0.113.7');
  });

  test('false when the token was minted for another surface', async () => {
    globalThis.fetch = async () => Response.json({ success: true, action: 'signup' });
    assert.equal(await verifyTurnstile('tok', 'sec'), false);
  });

  test('false without calling siteverify when the token is overlong', async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return Response.json({ success: true, action: 'contact' });
    };
    assert.equal(await verifyTurnstile('x'.repeat(2049), 'sec'), false);
    assert.equal(called, 0);
  });

  test('false on refusal, HTTP error, or network fault', async () => {
    globalThis.fetch = async () => Response.json({ success: false, action: 'contact' });
    assert.equal(await verifyTurnstile('tok', 'sec'), false);

    globalThis.fetch = async () => new Response('no', { status: 500 });
    assert.equal(await verifyTurnstile('tok', 'sec'), false);

    globalThis.fetch = async () => {
      throw new Error('down');
    };
    assert.equal(await verifyTurnstile('tok', 'sec'), false);
  });

  test('true when siteverify echoes a hostname on the allowlist', async () => {
    globalThis.fetch = async () =>
      Response.json({ success: true, action: 'contact', hostname: 'sdatygerberg.co.za' });
    assert.equal(
      await verifyTurnstile('tok', 'secret', undefined, ['sdatygerberg.co.za']),
      true,
    );
  });

  test('false on a hostname outside the allowlist', async () => {
    globalThis.fetch = async () =>
      Response.json({ success: true, action: 'contact', hostname: 'evil.example' });
    assert.equal(
      await verifyTurnstile('tok', 'secret', undefined, ['sdatygerberg.co.za']),
      false,
    );
  });

  test('false when the allowlist is configured but siteverify echoes no hostname', async () => {
    globalThis.fetch = async () => Response.json({ success: true, action: 'contact' });
    assert.equal(
      await verifyTurnstile('tok', 'secret', undefined, ['sdatygerberg.co.za']),
      false,
    );
  });

  test('no allowlist configured — hostname is ignored, even absent', async () => {
    globalThis.fetch = async () => Response.json({ success: true, action: 'contact' });
    assert.equal(await verifyTurnstile('tok', 'secret'), true);
  });
});

describe('checkTurnstile hostname allowlist', () => {
  const req = new Request('https://example.com/api/contact', { method: 'POST' });
  const env = {
    TURNSTILE_SECRET_KEY: 'secret',
    TURNSTILE_HOSTNAMES: 'sdatygerberg.co.za, tygerberg-sda.cloudkid.link',
  };

  test('parses TURNSTILE_HOSTNAMES and refuses a mismatched hostname', async () => {
    let seen;
    globalThis.fetch = async (_url, init) => {
      seen = init?.body;
      return Response.json({ success: true, action: 'contact', hostname: 'evil.example' });
    };
    assert.equal(
      await checkTurnstile(req, { 'cf-turnstile-response': 'tok' }, env),
      false,
    );
    assert.equal(seen.get('secret'), 'secret');
    assert.equal(seen.get('response'), 'tok');
  });

  test('accepts a hostname the env var allows', async () => {
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        action: 'contact',
        hostname: 'tygerberg-sda.cloudkid.link',
      });
    assert.equal(
      await checkTurnstile(req, { 'cf-turnstile-response': 'tok' }, env),
      true,
    );
  });
});

describe('checkTurnstile', () => {
  const req = (ip = '203.0.113.7') => new Request('https://x/api/contact', {
    method: 'POST',
    headers: ip ? { 'cf-connecting-ip': ip } : {},
  });

  test('null where no secret is set — the check is skipped, not failed', async () => {
    assert.equal(await checkTurnstile(req(), {}, {}), null);
    assert.equal(await checkTurnstile(req(), { 'cf-turnstile-response': 'tok' }, {}), null);
  });

  test('false where the token is missing', async () => {
    assert.equal(await checkTurnstile(req(), {}, { TURNSTILE_SECRET_KEY: 'sec' }), false);
  });

  test('delegates a present token to siteverify', async () => {
    globalThis.fetch = async () => Response.json({ success: true, action: 'contact' });
    assert.equal(
      await checkTurnstile(req(), { 'cf-turnstile-response': 'tok' }, { TURNSTILE_SECRET_KEY: 'sec' }),
      true,
    );
  });
});
