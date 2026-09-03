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
      return Response.json({ success: true });
    };
    assert.equal(await verifyTurnstile('tok123', 's3cret', '203.0.113.7'), true);
    assert.equal(seen.get('secret'), 's3cret');
    assert.equal(seen.get('response'), 'tok123');
    assert.equal(seen.get('remoteip'), '203.0.113.7');
  });

  test('false on refusal, HTTP error, or network fault', async () => {
    globalThis.fetch = async () => Response.json({ success: false });
    assert.equal(await verifyTurnstile('tok', 'sec'), false);

    globalThis.fetch = async () => new Response('no', { status: 500 });
    assert.equal(await verifyTurnstile('tok', 'sec'), false);

    globalThis.fetch = async () => {
      throw new Error('down');
    };
    assert.equal(await verifyTurnstile('tok', 'sec'), false);
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
    globalThis.fetch = async () => Response.json({ success: true });
    assert.equal(
      await checkTurnstile(req(), { 'cf-turnstile-response': 'tok' }, { TURNSTILE_SECRET_KEY: 'sec' }),
      true,
    );
  });
});
