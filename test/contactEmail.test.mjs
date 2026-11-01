import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { sendContactEmail } from '../src/worker/contactEmail.ts';

/*
 * Two sends: the Gmail receivers get the full enquiry plus the login link
 * (with the login screenshots attached), and each archive address gets the
 * same full enquiry for the R2 record. The archive send is best-effort; a
 * failed notification fails the channel.
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

/** Fixture bytes standing in for the login screenshots. */
function fakeImages(bytes = new Uint8Array([137, 80, 78, 71])) {
  return async (url) => {
    assert.match(String(url), /\/images\/login\//);
    return new Response(bytes, { status: 200 });
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

  test('the notification carries the full message, the login link and the footer', async () => {
    const f = fakeEmail();
    assert.equal(await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT), true);
    assert.equal(f.sent.length, 1);
    const msg = f.sent[0];
    assert.equal(msg.to, 'sdatygerbergklerk@gmail.com');
    assert.equal(msg.from, 'welkom@sdatygerberg.co.za');
    assert.match(msg.subject, /Verbind/);
    assert.match(msg.subject, /Jan van Wyk/);
    assert.match(msg.subject, /meld aan om te lees/);
    assert.match(msg.text, /Hallo, ek wil graag meer weet\./);
    assert.match(msg.text, /jan@example.co.za/);
    assert.match(msg.text, /https:\/\/sdatygerberg\.co\.za\/login/);
    assert.match(msg.text, /Tygerberg SDA Kerk/);
    assert.match(msg.text, new RegExp(AT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(!('replyTo' in msg));
  });

  test('uses the bible-study label for that topic, Navraag for an unknown one', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ topic: 'bible-study' }), AT);
    assert.match(f.sent[0].subject, /Bybelstudie/);
    await sendContactEmail({ ...baseEnv(), ...f }, fields({ topic: 'other' }), AT);
    assert.match(f.sent[1].subject, /Navraag/);
  });

  test('the notification carries the login screenshots as attachments', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT, undefined, 'https://x', fakeImages());
    assert.equal(f.sent[0].attachments.length, 3);
    assert.deepEqual(
      f.sent[0].attachments.map((a) => a.filename),
      ['meld-aan-desktop.png', 'meld-aan-mobile-1.png', 'meld-aan-mobile-2.png'],
    );
    assert.ok(f.sent[0].attachments.every((a) => typeof a.content === 'string' && a.content.length > 0));
    assert.ok(f.sent[0].attachments.every((a) => a.disposition === 'attachment' && a.type === 'image/png'));
    assert.match(f.sent[0].text, /aangehegte media/);
  });

  test('a failed image load sends the notification without attachments', async () => {
    const f = fakeEmail();
    const fail = async () => new Response('no', { status: 500 });
    assert.equal(
      await sendContactEmail({ ...baseEnv(), ...f }, fields(), AT, undefined, 'https://x', fail),
      true,
    );
    assert.ok(!('attachments' in f.sent[0]));
  });
});

describe('sendContactEmail archive copy', () => {
  test('one full send per archive address, trimmed and in order', async () => {
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
    // [0] is the notification; the rest are the archive copies.
    assert.equal(f.sent.length, 4);
    assert.deepEqual(
      f.sent.slice(1).map((m) => m.to),
      ['a@x.co.za', 'b@x.co.za', 'c@x.co.za'],
    );
    assert.match(f.sent[1].text, /Hallo, ek wil graag meer weet\./);
    assert.match(f.sent[1].text, /Toestemming gegee: ja/);
  });

  test('stray commas and whitespace produce no empty recipients', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      { ...baseEnv(), ...f, CONTACT_EMAIL_BCC: ' a@x.co.za ,,  b@x.co.za , ' },
      fields(),
      AT,
    );
    assert.equal(f.sent.length, 3);
    assert.deepEqual(
      f.sent.slice(1).map((m) => m.to),
      ['a@x.co.za', 'b@x.co.za'],
    );
  });

  test('an empty BCC string means notification only', async () => {
    const f = fakeEmail();
    await sendContactEmail({ ...baseEnv(), ...f, CONTACT_EMAIL_BCC: '' }, fields(), AT);
    assert.equal(f.sent.length, 1);
  });

  test('the consent record id is quoted in the archive copy when present', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      { ...baseEnv(), ...f, CONTACT_EMAIL_BCC: 'archive@sdatygerberg.co.za' },
      fields(),
      AT,
      'rec-123',
    );
    assert.match(f.sent[1].text, /Toestemmingsrekord: rec-123/);
    assert.match(f.sent[0].text, /Toestemmingsrekord: rec-123/);
  });

  test('an empty message prints the placeholder in the archive copy', async () => {
    const f = fakeEmail();
    await sendContactEmail(
      { ...baseEnv(), ...f, CONTACT_EMAIL_BCC: 'archive@sdatygerberg.co.za' },
      fields({ message: '' }),
      AT,
    );
    assert.match(f.sent[1].text, /\(geen boodskap nie\)/);
  });

  test('a failed archive hop is logged, never fatal', async () => {
    let calls = 0;
    const env = {
      ...baseEnv(),
      CONTACT_EMAIL_BCC: 'archive@sdatygerberg.co.za',
      EMAIL: {
        async send(msg) {
          calls++;
          if (calls > 1) throw Object.assign(new Error('r2 down'), { code: 'E_ARCH' });
        },
      },
    };
    assert.equal(await sendContactEmail(env, fields(), AT), true);
    assert.match(errored.join('\n'), /archive FAILED.*code=E_ARCH/);
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

  test('one notification per TO address; notified when any of them got it', async () => {
    const sent = [];
    const EMAIL = { async send(msg) { if (msg.to === 'kerk@x.test') throw Object.assign(new Error('unverified'), { code: 'E_DEST' }); sent.push(msg); } };
    const realError = console.error;
    console.error = () => {};
    try {
      const ok = await sendContactEmail({ ...baseEnv({ CONTACT_EMAIL_TO: 'klerk@x.test, kerk@x.test ,tes@x.test,' }), EMAIL }, fields(), AT);
      assert.equal(ok, true);
      assert.deepEqual(sent.map((m) => m.to), ['klerk@x.test', 'tes@x.test']);
      const allFail = { async send() { throw new Error('down'); } };
      assert.equal(await sendContactEmail({ ...baseEnv({ CONTACT_EMAIL_TO: 'a@x.test,b@x.test' }), EMAIL: allFail }, fields(), AT), false);
    } finally {
      console.error = realError;
    }
  });

  test('returns false on a notification failure and logs the code, not the submission — C-20', async () => {
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
