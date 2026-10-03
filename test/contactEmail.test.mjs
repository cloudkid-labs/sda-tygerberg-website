import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { sendContactEmail } from '../src/worker/contactEmail.ts';

/*
 * The BCC var is a comma-separated list (wrangler.jsonc) parsed here — C-31.
 * Every recipient must also sit in the send_email allowlist or the whole send
 * is rejected, so the splitting behaviour below is what the config test locks.
 */

const AT = '2026-09-20T10:00:00.000Z';

const fields = (over = {}) => ({
  topic: 'connect',
  name: 'Jan van Wyk',
  email: 'jan@example.co.za',
  phone: '',
  message: 'Hallo, ek wil graag meer weet.',
  ...over,
});

const baseEnv = (over = {}) => ({
  CONTACT_EMAIL_TO: 'sdatygerbergklerk@gmail.com',
  CONTACT_EMAIL_FROM: 'welkom@sdatygerberg.co.za',
  ...over,
});

function fakeEmail({ failWith = null } = {}) {
  const sent = [];
  return {
    sent,
    EMAIL: {
      async send(msg) {
        if (failWith) throw failWith;
        sent.push(msg);
      },
    },
  };
}

let logged;
let errored;
const realLog = console.log;
const realError = console.error;

beforeEach(() => {
  logged = [];
  errored = [];
  console.log = (...args) => logged.push(args.join(' '));
  console.error = (...args) => errored.push(args.join(' '));
});

afterEach(() => {
  console.log = realLog;
  console.error = realError;
});

describe('sendContactEmail configuration', () => {
  test('returns false without sending when the binding or addresses are missing', async () => {
    const f = fakeEmail();
    assert.equal(await sendContactEmail({ ...baseEnv() }, fields(), AT), false);
    assert.equal(await sendContactEmail({ ...baseEnv(), ...f, CONTACT_EMAIL_TO: undefined }, fields(), AT), false);
    assert.equal(await sendContactEmail({ ...baseEnv(), ...f, CONTACT_EMAIL_FROM: undefined }, fields(), AT), false);
    assert.equal(f.sent.length, 0);
  });

  test('sends to/from/subject/body with no bcc key when BCC is unset', async () => {
    const f = fakeEmail();
    assert.equal(await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT), true);
    assert.equal(f.sent.length, 1);
    const msg = f.sent[0];
    assert.equal(msg.to, 'sdatygerbergklerk@gmail.com');
    assert.equal(msg.from, 'welkom@sdatygerberg.co.za');
    assert.ok(!('bcc' in msg));
    assert.match(msg.subject, /Verbind/);
    assert.match(msg.subject, /Jan van Wyk/);
    assert.match(msg.text, /Nuwe navraag vanaf die webwerf\./);
    assert.match(msg.text, /Toestemming gegee: ja/);
    assert.match(msg.text, new RegExp(AT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(msg.replyTo, 'jan@example.co.za');
  });

  test('omits replyTo when the visitor gave no address', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ email: '', phone: '0820000000' }), AT);
    assert.ok(!('replyTo' in f.sent[0]));
    assert.match(f.sent[0].text, /\(nie verskaf nie\)/);
  });

  test('uses the bible-study label for that topic, Navraag for an unknown one', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ topic: 'bible-study' }), AT);
    assert.match(f.sent[0].subject, /Bybelstudie/);
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ topic: 'other' }), AT);
    assert.match(f.sent[1].subject, /Navraag/);
  });
});

describe('sendContactEmail BCC parsing', () => {
  test('a single BCC becomes a one-element array', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      { ...baseEnv(), ...f, CONTACT_EMAIL_BCC: 'archive@sdatygerberg.co.za' },
      fields(),
      AT,
    );
    assert.deepEqual(f.sent[0].bcc, ['archive@sdatygerberg.co.za']);
  });

  test('multiple BCC addresses are split, trimmed, and kept in order', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      {
        ...baseEnv(),
        ...f,
        CONTACT_EMAIL_BCC: 'a@x.co.za, b@x.co.za, c@x.co.za',
      },
      fields(),
      AT,
    );
    assert.deepEqual(f.sent[0].bcc, ['a@x.co.za', 'b@x.co.za', 'c@x.co.za']);
  });

  test('stray commas and whitespace produce no empty recipients', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      { ...baseEnv(), ...f, CONTACT_EMAIL_BCC: ' a@x.co.za ,,  b@x.co.za , ' },
      fields(),
      AT,
    );
    assert.deepEqual(f.sent[0].bcc, ['a@x.co.za', 'b@x.co.za']);
  });

  test('an empty BCC string means no bcc key, not a malformed recipient', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f, CONTACT_EMAIL_BCC: '' }, fields(), AT);
    assert.ok(!('bcc' in f.sent[0]));
  });
});

describe('sendContactEmail body and headers', () => {
  test('flattens CR/LF in the name so the subject stays one line — C-32', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ name: 'Jan\r\nBcc: evil@x' }), AT);
    assert.doesNotMatch(f.sent[0].subject, /[\r\n]/);
  });

  test('clamps a very long name in the subject', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ name: 'J'.repeat(200) }), AT);
    assert.ok(f.sent[0].subject.length < 200);
  });

  test('the consent record id is quoted when present, omitted when absent', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT, 'rec-123');
    assert.match(f.sent[0].text, /Toestemmingsrekord: rec-123/);
    await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT);
    assert.doesNotMatch(f.sent[1].text, /Toestemmingsrekord/);
  });

  test('an empty message prints the placeholder, never a blank line claim', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ message: '' }), AT);
    assert.match(f.sent[0].text, /\(geen boodskap nie\)/);
  });

  test('returns false on a send failure and logs the code, not the submission — C-20', async () => {
    const f = fakeEmail({ failWith: Object.assign(new Error('destination not verified'), { code: 'E_FAIL' }) });
    assert.equal(
      await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT),
      false,
    );
    assert.match(errored.join('\n'), /FAILED.*code=E_FAIL/);
    assert.doesNotMatch(errored.join('\n'), /jan@example\.co\.za/);
    assert.doesNotMatch(errored.join('\n'), /Hallo, ek wil/);
  });
});
