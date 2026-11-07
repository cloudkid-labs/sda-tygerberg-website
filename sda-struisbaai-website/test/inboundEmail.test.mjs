import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { handleInboundEmail } from '../src/worker/inboundEmail.ts';

const CHURCH = 'sdatygerbergklerk@gmail.com';
const ARCHIVE = 'archive@sdatygerberg.co.za';
const TREASURER = 'treasurer@example.test';
const ROUTES = { 'tesourier@sdatygerberg.co.za': TREASURER };

/** A `ForwardableEmailMessage` stand-in that records what was attempted. */
function fakeMessage(to, { failFor = [] } = {}) {
  const attempted = [];
  const rejections = [];
  return {
    attempted,
    rejections,
    message: {
      to,
      async forward(rcptTo) {
        attempted.push(rcptTo);
        if (failFor.includes(rcptTo)) throw new Error('destination address is not verified');
      },
      setReject(reason) {
        rejections.push(reason);
      },
    },
  };
}

const KEY = 'submissions/2026/10/25/2026-10-25T10:00:00.000Z-abc-1.json';

/** One website thread the board has answered once, as Brevo sent it. */
function threadBucket() {
  const store = new Map([[KEY, JSON.stringify({
    id: 'abc-1', submittedAt: '2026-10-25T10:00:00.000Z', topic: 'connect', name: 'Jan', email: 'jan@example.co.za',
    phone: null, lang: 'af', message: 'Hallo',
    replies: [{ by: 'boss@example.co.za', at: '2026-10-26T10:00:00.000Z', body: 'Ons sien jou Sabbat.', messageId: '<ours-1@smtp-relay.mailin.fr>' }],
  })]]);
  let seq = 0;
  const etags = new Map([[KEY, 'e0']]);
  return {
    store,
    bucket: {
      async put(key, value, opts = {}) {
        if (opts.onlyIf?.etagMatches && etags.get(key) !== opts.onlyIf.etagMatches) return null;
        store.set(key, value);
        etags.set(key, `e${++seq}`);
        return { key };
      },
      async get(key) {
        const v = store.get(key);
        return v === undefined ? null : { etag: etags.get(key), async json() { return JSON.parse(v); } };
      },
      async list({ prefix = '' } = {}) {
        return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
      },
    },
  };
}

function mime({ from, subject, body, inReplyTo }) {
  const headers = [`From: ${from}`, 'To: welkom@sdatygerberg.co.za', `Subject: ${subject}`, 'Message-ID: <theirs-1@example.co.za>'];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  headers.push('Content-Type: text/plain; charset=utf-8');
  return new Response(`${headers.join('\r\n')}\r\n\r\n${body}`).body;
}

/** Runs `fn` with console.error captured, so a failure test can read it. */
async function capturingErrors(fn) {
  const logged = [];
  const real = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.error = real;
  }
  return logged;
}

describe('handleInboundEmail', () => {
  test('forwards to the church, then the archive, in that order', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ARCHIVE_TO: ARCHIVE });
    assert.deepEqual(m.attempted, [CHURCH, ARCHIVE]);
    assert.deepEqual(m.rejections, []);
  });

  test('archives nothing when no archive address is configured', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH });
    assert.deepEqual(m.attempted, [CHURCH]);
    assert.deepEqual(m.rejections, []);
  });

  test('refuses, without forwarding anywhere, where no forward address is configured', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    await handleInboundEmail(m.message, {});
    assert.deepEqual(m.attempted, []);
    assert.equal(m.rejections.length, 1);
  });

  // The wrong-data fixture: a mail that cannot be delivered must bounce, not
  // disappear. A gate that cannot fail certifies nothing.
  test('rejects when the church copy fails, and does not try the archive', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za', { failFor: [CHURCH] });
    const logged = await capturingErrors(() =>
      handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ARCHIVE_TO: ARCHIVE }),
    );
    assert.deepEqual(m.attempted, [CHURCH]);
    assert.equal(m.rejections.length, 1);
    assert.match(logged.join('\n'), /forward to sdatygerbergklerk@gmail\.com failed/);
  });

  test('keeps the mail, and does not reject, when only the archive hop fails', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za', { failFor: [ARCHIVE] });
    const logged = await capturingErrors(() =>
      handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ARCHIVE_TO: ARCHIVE }),
    );
    assert.deepEqual(m.attempted, [CHURCH, ARCHIVE]);
    assert.deepEqual(m.rejections, []);
    assert.match(logged.join('\n'), /forward to archive@sdatygerberg\.co\.za failed/);
  });

  test('does not re-post mail addressed to the archive address itself', async () => {
    const m = fakeMessage(' Archive@Sdatygerberg.co.za ');
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ARCHIVE_TO: ARCHIVE });
    assert.deepEqual(m.attempted, [CHURCH]);
    assert.deepEqual(m.rejections, []);
  });

  test('a routed address goes to its own destination, then the archive', async () => {
    const m = fakeMessage('tesourier@sdatygerberg.co.za');
    await handleInboundEmail(m.message, {
      MAIL_FORWARD_TO: CHURCH,
      MAIL_ARCHIVE_TO: ARCHIVE,
      MAIL_ROUTES: ROUTES,
    });
    assert.deepEqual(m.attempted, [TREASURER, ARCHIVE]);
    assert.deepEqual(m.rejections, []);
  });

  test('routes match regardless of case and surrounding space', async () => {
    const m = fakeMessage(' Tesourier@SDATygerberg.co.za ');
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ROUTES: ROUTES });
    assert.deepEqual(m.attempted, [TREASURER]);
  });

  test('an address with no route still goes to the church', async () => {
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, MAIL_ROUTES: ROUTES });
    assert.deepEqual(m.attempted, [CHURCH]);
  });

  test('rejects when the routed copy fails, and falls back to neither church nor archive', async () => {
    const m = fakeMessage('tesourier@sdatygerberg.co.za', { failFor: [TREASURER] });
    const logged = await capturingErrors(() =>
      handleInboundEmail(m.message, {
        MAIL_FORWARD_TO: CHURCH,
        MAIL_ARCHIVE_TO: ARCHIVE,
        MAIL_ROUTES: ROUTES,
      }),
    );
    assert.deepEqual(m.attempted, [TREASURER]);
    assert.equal(m.rejections.length, 1);
    assert.match(logged.join('\n'), /forward to treasurer@example\.test failed/);
  });
  test('an emailed answer to our reply is filed under its website thread', async () => {
    const { bucket, store } = threadBucket();
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    m.message.raw = mime({
      from: 'Jan Example <jan@example.co.za>',
      subject: 'Re: Jou boodskap aan Tygerberg SDA',
      inReplyTo: '<ours-1@smtp-relay.mailin.fr>',
      body: 'Dankie, ek sal daar wees.\r\n\r\nOn Sun, 1 Nov 2026 at 10:00, Welkom <welkom@sdatygerberg.co.za> wrote:\r\n> Ons sien jou Sabbat.',
    });
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, SUBMISSIONS: bucket });
    assert.deepEqual(m.attempted, [CHURCH], 'delivery to the church comes first, as before');
    const thread = JSON.parse(store.get(KEY));
    assert.equal(thread.replies.length, 2);
    const answer = thread.replies[1];
    assert.equal(answer.inbound, true);
    assert.equal(answer.by, 'jan@example.co.za');
    assert.equal(answer.body, 'Dankie, ek sal daar wees.', 'the quoted reply is cut off');
    assert.equal(store.size, 1, 'no separate Board mail item');
  });

  test('mail that answers no website thread is delivered but not kept in Board mail', async () => {
    const { bucket, store } = threadBucket();
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    m.message.raw = mime({ from: 'Laura <laura@example.co.za>', subject: 'Laura verslag', body: 'Hi Sanet, please see attached :)' });
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, SUBMISSIONS: bucket });
    assert.deepEqual(m.attempted, [CHURCH]);
    assert.equal(store.size, 1);
    assert.equal(JSON.parse(store.get(KEY)).replies.length, 1, 'thread untouched');
  });

  test('keeps delivered mail when MIME parsing fails', async () => {
    const errors = await capturingErrors(async () => {
      const m = fakeMessage('welkom@sdatygerberg.co.za');
      m.message.raw = new Response('not a valid email').body;
      await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, SUBMISSIONS: { async put() { throw new Error('unexpected'); } } });
      assert.deepEqual(m.attempted, [CHURCH]);
      assert.deepEqual(m.rejections, []);
    });
    assert.match(errors.join(' '), /thread filing failed/);
  });

});
