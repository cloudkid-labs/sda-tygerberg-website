import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * docs/email-routing.md draws what wrangler.jsonc configures. A diagram that
 * drifts from the config is worse than none, so the two are pinned together:
 * every configured address is on the page, and every address on the page is
 * configured.
 */

const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
// Comments here are full-line `//` only; strip them to reach plain JSON.
const config = JSON.parse(
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n'),
);
const doc = readFileSync(new URL('../docs/email-routing.md', import.meta.url), 'utf8');
const diagram = doc.match(/```mermaid\r?\n([\s\S]*?)```/)?.[1] ?? '';

const ADDRESS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const norm = (a) => a.trim().toLowerCase();

const { vars, send_email } = config;
const configured = new Set(
  [
    vars.CONTACT_EMAIL_TO,
    vars.CONTACT_EMAIL_FROM,
    ...String(vars.CONTACT_EMAIL_BCC ?? '').split(','),
    ...String(vars.MAIL_SEND_FROM ?? '').split(','),
    vars.MAIL_FORWARD_TO,
    vars.MAIL_ARCHIVE_TO,
    ...Object.keys(vars.MAIL_ROUTES ?? {}),
    ...Object.values(vars.MAIL_ROUTES ?? {}),
    ...send_email.flatMap((b) => [...b.allowed_destination_addresses, ...b.allowed_sender_addresses]),
  ]
    .filter(Boolean)
    .map(norm)
    .filter((a) => a.includes('@')),
);

describe('docs/email-routing.md matches wrangler.jsonc', () => {
  test('the page has a mermaid diagram', () => {
    assert.ok(diagram.length > 0, 'no ```mermaid block in docs/email-routing.md');
  });

  test('every configured address is in the diagram', () => {
    const drawn = new Set((diagram.match(ADDRESS) ?? []).map(norm));
    for (const addr of configured) {
      assert.ok(drawn.has(addr), `${addr} is configured but missing from the diagram`);
    }
  });

  test('every configured address is in the address table', () => {
    for (const addr of configured) {
      assert.ok(doc.includes(`| \`${addr}\` |`), `${addr} has no row in the address table`);
    }
  });

  test('every address on the page is configured — nothing stale', () => {
    for (const addr of new Set((doc.match(ADDRESS) ?? []).map(norm))) {
      if (addr.startsWith('any@')) continue; // the diagram's placeholder sender
      assert.ok(configured.has(addr), `${addr} is on the page but not in wrangler.jsonc`);
    }
  });
});
