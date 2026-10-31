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
  test('stores parsed inbound mail in Board Mail after forwarding', async () => {
    const store = new Map();
    const bucket = { async put(key, value) { store.set(key, value); } };
    const m = fakeMessage('welkom@sdatygerberg.co.za');
    m.message.raw = new Response('From: Jan Example <jan@example.co.za>\r\nTo: welkom@sdatygerberg.co.za\r\nSubject: Re: Hallo\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDankie, ek sal daar wees.').body;
    await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, SUBMISSIONS: bucket });
    assert.deepEqual(m.attempted, [CHURCH]);
    assert.equal(store.size, 1);
    const item = JSON.parse([...store.values()][0]);
    assert.equal(item.topic, 'email');
    assert.equal(item.email, 'jan@example.co.za');
    assert.equal(item.subject, 'Re: Hallo');
    assert.equal(item.message, 'Dankie, ek sal daar wees.');
    assert.equal(item.replyFrom, 'welkom@sdatygerberg.co.za');
  });

  test('keeps delivered mail when MIME parsing fails', async () => {
    const errors = await capturingErrors(async () => {
      const m = fakeMessage('welkom@sdatygerberg.co.za');
      m.message.raw = new Response('not a valid email').body;
      await handleInboundEmail(m.message, { MAIL_FORWARD_TO: CHURCH, SUBMISSIONS: { async put() { throw new Error('unexpected'); } } });
      assert.deepEqual(m.attempted, [CHURCH]);
      assert.deepEqual(m.rejections, []);
    });
    assert.match(errors.join(' '), /inbox store failed/);
  });

});
