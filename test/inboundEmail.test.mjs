import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { handleInboundEmail } from '../src/worker/inboundEmail.ts';

const CHURCH = 'sdatygerbergklerk@gmail.com';
const ARCHIVE = 'archive@sdatygerberg.co.za';

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
});
