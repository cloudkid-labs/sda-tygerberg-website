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
  test('CONTACT_EMAIL_BCC carries only the church-controlled archive', () => {
    assert.ok(
      bccList.includes('archive@sdatygerberg.co.za'),
      'archive@sdatygerberg.co.za missing from CONTACT_EMAIL_BCC',
    );
    assert.ok(
      !bccList.includes('rainiersvn1@gmail.com'),
      'personal monitoring inbox must not be in CONTACT_EMAIL_BCC',
    );
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

  test('every TO is fenced as a destination, FROM as a sender', () => {
    const to = String(config.vars.CONTACT_EMAIL_TO).split(',').map((a) => a.trim());
    assert.ok(to.length > 0 && to.every(Boolean), 'a stray comma would be a malformed recipient');
    for (const addr of to) {
      assert.ok(config.send_email[0].allowed_destination_addresses.includes(addr), `${addr} is not an allowed destination`);
    }
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

  test('devtest binds only its own buckets — trialling the inbox or the CMS never touches prod — C-69, C-70', () => {
    const buckets = config.env.devtest.r2_buckets ?? [];
    assert.deepEqual(
      buckets.map((b) => [b.binding, b.bucket_name]),
      [
        ['SUBMISSIONS', 'tygerberg-submissions-devtest'],
        ['CMS', 'tygerberg-cms-devtest'],
      ],
    );
    assert.ok(buckets.every((b) => b.bucket_name.endsWith('-devtest')));
  });

  test('devtest signs in the same board as production — vars do not inherit — C-70', () => {
    for (const key of ['BOARD_ALLOWED_EMAILS', 'BOARD_SEND_AS', 'BOARD_ADMIN_EMAILS', 'BOARD_ADMIN_ONLY_EMAILS']) {
      assert.equal(config.env.devtest.vars[key], config.vars[key], `${key} differs between production and devtest`);
    }
  });

  test('devtest switches Board mail off; production leaves it on', () => {
    assert.equal(config.env.devtest.vars.BOARD_MAIL, 'off');
    assert.ok(!('BOARD_MAIL' in config.vars) || config.vars.BOARD_MAIL !== 'off', 'production must keep Board mail');
  });
});

describe('the CMS bucket and its producer — C-70', () => {
  const r2tf = readFileSync(new URL('../terraform/r2.tf', import.meta.url), 'utf8');
  const managed = [...r2tf.matchAll(/name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

  test('production binds CMS to a bucket terraform/ creates', () => {
    const cms = config.r2_buckets.find((b) => b.binding === 'CMS');
    assert.ok(cms, 'CMS binding missing');
    assert.ok(managed.includes(cms.bucket_name), `${cms.bucket_name} is not in terraform/r2.tf`);
  });

  test('devtest binds CMS to the bucket terraform/ creates for it', () => {
    const cms = config.env.devtest.r2_buckets.find((b) => b.binding === 'CMS');
    assert.ok(managed.includes(cms.bucket_name));
  });

  test('both Workers carry the import.meta.env define the React render needs', () => {
    for (const block of [config, config.env.devtest]) {
      assert.deepEqual(JSON.parse(block.define['import.meta.env']), { BASE_URL: '/' });
    }
  });
});

/*
 * wrangler-action uploads `secrets:` with `wrangler secret bulk`, adding
 * `--env` only from its own `environment` input — never from `command`. A
 * step that deploys `--env devtest` without `environment: devtest` uploads its
 * secrets to the top-level Worker, which is production (C-70).
 */
describe('wrangler-action secrets reach the Worker the step deploys', () => {
  const workflowDir = new URL('../.github/workflows/', import.meta.url);
  for (const file of ['deploy-devtest-cloudflare.yml', 'deploy-production-cloudflare.yml']) {
    const yml = readFileSync(new URL(file, workflowDir), 'utf8');
    const steps = yml.split(/\n\s*- name: /).filter((s) => s.includes('cloudflare/wrangler-action'));
    test(`${file}: secrets upload targets the deployed env`, () => {
      assert.ok(steps.length > 0, 'no wrangler-action step found');
      for (const step of steps) {
        const cmdEnv = step.match(/^\s*command:.*--env[ =](\S+)/m)?.[1] ?? null;
        const inputEnv = step.match(/^\s*environment:\s*(\S+)/m)?.[1] ?? null;
        if (/^\s*secrets:/m.test(step)) assert.equal(inputEnv, cmdEnv, 'environment: must equal the --env in command');
      }
    });
  }
});

describe('Board mail send-as — who sends as, and sees, what', () => {
  const parse = (v) => Object.fromEntries(String(v).split(';').map((e) => { const [who, list] = e.split('='); return [who.trim(), list.split(',').map((a) => a.trim()).sort()]; }));
  const want = {
    'sdatygerbergklerk@gmail.com': ['klerk@sdatygerberg.co.za', 'welkom@sdatygerberg.co.za'],
    'sdatygerbergkerk@gmail.com': ['kerk@sdatygerberg.co.za', 'welkom@sdatygerberg.co.za'],
    'muller31jp@gmail.com': ['tesourier@sdatygerberg.co.za', 'welkom@sdatygerberg.co.za'],
    'johanemomberg@gmail.com': ['kerk@sdatygerberg.co.za', 'klerk@sdatygerberg.co.za', 'welkom@sdatygerberg.co.za'],
    'laurahoffman51@gmail.com': ['welkom@sdatygerberg.co.za'],
  };
  test('production and devtest give each member exactly their addresses', () => {
    assert.deepEqual(parse(config.vars.BOARD_SEND_AS), want);
    assert.deepEqual(parse(config.env.devtest.vars.BOARD_SEND_AS), want);
  });
  test('every non-admin who may sign in is fenced (none falls back to every address)', () => {
    const admins = new Set(String(config.vars.BOARD_ADMIN_EMAILS).split(','));
    for (const who of String(config.vars.BOARD_ALLOWED_EMAILS).split(',')) {
      if (!admins.has(who)) assert.ok(want[who], `${who} has no BOARD_SEND_AS entry`);
    }
  });
  test('rainier@ goes to the admin, not the clerk', () => {
    assert.equal(config.vars.MAIL_ROUTES['rainier@sdatygerberg.co.za'], 'rainiersvn1@gmail.com');
  });
});

describe('Settings tab destinations (C-71)', () => {
  test('MAIL_DESTINATIONS is exactly the send fence, and covers every route and notification', () => {
    const dest = String(config.vars.MAIL_DESTINATIONS).split(',').map((a) => a.trim()).sort();
    assert.deepEqual(dest, [...config.send_email[0].allowed_destination_addresses].sort());
    for (const to of Object.values(config.vars.MAIL_ROUTES)) assert.ok(dest.includes(to), `${to} is routed to but not a destination`);
    for (const to of String(config.vars.CONTACT_EMAIL_TO).split(',')) assert.ok(dest.includes(to.trim()), `${to} is notified but not a destination`);
  });
});
