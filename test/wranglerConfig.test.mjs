import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The BCC/out-of-step failure is silent until a real submission: Cloudflare
 * rejects the whole send where a recipient leaves the allowlist (C-31). This
 * pins the config shape that `wrangler deploy --dry-run` only prints.
 */

const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
// Comments here are full-line `//` only; strip them to reach plain JSON.
const config = JSON.parse(
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n'),
);

const bccList = String(config.vars.CONTACT_EMAIL_BCC)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

describe('wrangler contact mail fence — C-31', () => {
  test('CONTACT_EMAIL_BCC carries the archive, the monitoring inbox and the church inbox', () => {
    for (const addr of ['archive@sdatygerberg.co.za', 'rainiersvn1@gmail.com', 'sdatygerbergkerk@gmail.com']) {
      assert.ok(bccList.includes(addr), `${addr} missing from CONTACT_EMAIL_BCC`);
    }
  });

  test('every BCC recipient sits in allowed_destination_addresses', () => {
    const allowed = config.send_email[0].allowed_destination_addresses;
    for (const addr of bccList) {
      assert.ok(allowed.includes(addr), `${addr} would fail the whole send`);
    }
  });

  test('the BCC var has no empty entries from stray commas', () => {
    assert.equal(
      bccList.length,
      String(config.vars.CONTACT_EMAIL_BCC).split(',').length,
      'a stray comma would be a malformed recipient',
    );
  });

  test('TO is fenced as a destination, FROM as a sender', () => {
    assert.ok(
      config.send_email[0].allowed_destination_addresses.includes(config.vars.CONTACT_EMAIL_TO),
    );
    assert.ok(
      config.send_email[0].allowed_sender_addresses.includes(config.vars.CONTACT_EMAIL_FROM),
    );
  });
});

describe('wrangler inbound mail routes — C-65', () => {
  test('tesourier@ (the Zapper merchant address) routes away from the catch-all', () => {
    const routes = config.vars.MAIL_ROUTES;
    const dest = routes['tesourier@sdatygerberg.co.za'];
    assert.ok(dest, 'tesourier@ has no route');
    assert.notEqual(dest, config.vars.MAIL_FORWARD_TO);
  });

  test('every route is a local address with a destination elsewhere', () => {
    for (const [local, dest] of Object.entries(config.vars.MAIL_ROUTES)) {
      assert.match(local, /@sdatygerberg\.co\.za$/, `${local} is not on the church domain`);
      assert.match(dest, /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/, `${local} → ${dest} is not one address`);
    }
  });
});

describe('wrangler routes and bindings', () => {
  test('the Worker sees every path — the request log depends on it (C-66)', () => {
    // Narrow this list and the request log silently loses everything the
    // asset store answers first, which is every page. The smoke run still
    // passes; only the log quietly stops naming visitors.
    assert.equal(config.assets.run_worker_first[0], '/*');
    assert.ok(
      config.assets.run_worker_first.includes('!/images/hod/fallback/*'),
      'the fallbacks belong on the default asset path — they need no logic',
    );
  });

  test('production serves the apex as a custom domain', () => {
    assert.ok(
      config.routes.some((r) => r.pattern === 'sdatygerberg.co.za' && r.custom_domain),
    );
  });

  test('the consent bucket is bound', () => {
    assert.ok(
      config.r2_buckets.some(
        (b) => b.binding === 'CONSENT' && b.bucket_name === 'consent-cloudkid-link',
      ),
    );
  });

  test('devtest carries no mail or consent bindings — a preview never emails — C-61', () => {
    const devtest = config.env.devtest;
    assert.ok(!('send_email' in devtest), 'devtest must not send mail');
    assert.ok(!('r2_buckets' in devtest), 'devtest must not write consent');
    assert.ok(
      !Object.keys(devtest.vars).some((k) => k.startsWith('CONTACT_EMAIL')),
      'devtest must not name church addresses',
    );
    assert.ok(
      !Object.keys(devtest.vars).some((k) => k.startsWith('MAIL_')),
      'devtest must not forward inbound mail',
    );
    assert.ok(
      devtest.routes.some((r) => r.pattern === 'tygerberg-sda.cloudkid.link' && r.custom_domain),
    );
  });
});
