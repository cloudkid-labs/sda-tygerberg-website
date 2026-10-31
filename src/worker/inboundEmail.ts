/// <reference types="@cloudflare/workers-types" />

import PostalMime from 'postal-mime';

/**
 * Inbound mail for the church domain.
 *
 * The `sdatygerberg.co.za` catch-all routes every address to this Worker, so
 * this is the only place an inbound message is decided. Two copies leave here:
 *
 *   1. `MAIL_FORWARD_TO` — the church's mailbox, a verified destination address
 *      on the account. This one is the delivery: when it fails the message is
 *      rejected, so the sender learns instead of nothing happening. An address
 *      listed in `MAIL_ROUTES` is delivered to its own destination instead —
 *      `tesourier@` to the treasurer — under the same rules.
 *   2. `MAIL_ARCHIVE_TO` — a second, best-effort copy. A literal routing rule
 *      in the same zone hands that address to the `cloudkid-link-r2-explorer`
 *      Worker, which files the message in R2 and does nothing else. A Worker
 *      cannot invoke another Worker's `email()` handler, so the archive hop is
 *      an address with a rule behind it rather than a function call — and it is
 *      safe to loop through Email Routing only because the far end stores.
 *
 * Both addresses must be verified destination addresses on the account or
 * `forward()` throws, which is why each hop is attempted separately and an
 * archive failure is not fatal. CONCERNS.md C-65.
 */

export type InboundEmailEnv = {
  /** Where the church reads its mail. */
  MAIL_FORWARD_TO?: string;
  /**
   * Per-address exceptions to `MAIL_FORWARD_TO`: local address → destination.
   * Matched case-insensitively. Each destination must be verified too.
   */
  MAIL_ROUTES?: Record<string, string>;
  /** The archive hop. Unset skips archiving entirely. */
  MAIL_ARCHIVE_TO?: string;
  /** Board Mail Inbox storage. Inbound messages are stored after delivery. */
  SUBMISSIONS?: R2Bucket;
};

/**
 * The slice of `ForwardableEmailMessage` this module uses. A `Pick` rather than
 * a hand-rolled shape: the platform signature for `forward()` has already
 * moved once — it returns `EmailSendResult` now, not `void` — and this way the
 * real type stays the source of truth.
 */
export type InboundEmailMessage = Pick<ForwardableEmailMessage, 'to' | 'forward' | 'setReject'> & {
  raw?: ReadableStream<Uint8Array>;
};

const MAX_INBOUND_BYTES = 5 * 1024 * 1024;
const MAX_STORED_BODY_CHARS = 100_000;

const BLOCK_EMAIL_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl',
  'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'main', 'nav', 'ol', 'p', 'section', 'table', 'tr', 'ul',
]);
const HIDDEN_EMAIL_ELEMENTS = new Set([
  'head', 'script', 'style', 'title', 'meta', 'link', 'noscript', 'template',
  'svg', 'canvas', 'iframe', 'object', 'embed',
]);

function normalizeEmailText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
    .trim();
}

/**
 * Extracts visible text from an untrusted HTML alternative. The original
 * markup is never stored or rendered; unsupported Worker runtimes fall back to
 * PostalMime's plain-text alternative.
 */
async function emailHtmlToText(html: string): Promise<string> {
  if (typeof HTMLRewriter === 'undefined') return '';

  const chunks: string[] = [];
  const transformed = new HTMLRewriter()
    .on('*', {
      element(element) {
        const tag = element.tagName.toLowerCase();
        if (HIDDEN_EMAIL_ELEMENTS.has(tag)) {
          element.remove();
          return;
        }
        if (tag === 'br' || tag === 'hr') {
          chunks.push('\n');
          return;
        }
        if (tag === 'img') {
          const alt = element.getAttribute('alt')?.trim();
          if (alt) chunks.push('[Image: ' + alt + ']');
          element.remove();
          return;
        }
        if (tag === 'li') {
          chunks.push('\n- ');
          element.onEndTag(() => chunks.push('\n'));
          return;
        }
        if (BLOCK_EMAIL_ELEMENTS.has(tag)) {
          chunks.push('\n');
          element.onEndTag(() => chunks.push('\n'));
        }
      },
      text(chunk) {
        if (!chunk.removed) chunks.push(chunk.text);
      },
    })
    .transform(new Response(html));

  // Consume the transformed stream so every HTMLRewriter handler runs.
  await transformed.text();
  return normalizeEmailText(chunks.join(''));
}

async function emailBodyText(parsed: { html?: string; text?: string }): Promise<string> {
  if (parsed.html) {
    try {
      const htmlText = await emailHtmlToText(parsed.html);
      if (htmlText) return htmlText;
    } catch {
      // Keep the decoded text/plain alternative if HTML extraction fails.
    }
  }
  return normalizeEmailText(parsed.text ?? '');
}

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INBOUND_BYTES) throw new Error('message exceeds inbox parsing limit');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

const sameAddress = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The routed destination for `rcptTo`, or undefined when it has none. */
function routeFor(routes: Record<string, string> | undefined, rcptTo: string): string | undefined {
  if (!routes) return undefined;
  const key = Object.keys(routes).find((local) => sameAddress(local, rcptTo));
  return key === undefined ? undefined : routes[key];
}

/**
 * One forward attempt. Never throws — the two hops mean different things to
 * the caller, so the decision about a failure belongs there.
 */
async function attempt(message: InboundEmailMessage, rcptTo: string): Promise<boolean> {
  try {
    await message.forward(rcptTo);
    return true;
  } catch (error) {
    // The observability tail is the only place a blocked hop surfaces — C-64's
    // lesson, applied here. Addresses only: configuration, not correspondence.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`inbound mail: forward to ${rcptTo} failed: ${detail}`);
    return false;
  }
}

/**
 * Decides and performs the hops. Returns nothing — what the platform does with
 * the message afterwards is decided by `setReject`, not by a return value.
 */
export async function handleInboundEmail(
  message: InboundEmailMessage,
  env: InboundEmailEnv,
): Promise<void> {
  const forwardTo = routeFor(env.MAIL_ROUTES, message.to) ?? env.MAIL_FORWARD_TO;

  if (!forwardTo) {
    // The devtest Worker carries no mail vars on purpose (C-61), and nothing
    // routes mail to it either. A refusal gate, not a path.
    message.setReject('Mail is not configured for this deployment.');
    return;
  }

  if (!(await attempt(message, forwardTo))) {
    // Nothing reached the church. Rejecting hands the problem back to the
    // sender's mail server as a bounce, rather than vanishing inside two
    // systems that both look healthy.
    message.setReject('Delivery failed. Please try again later.');
    return;
  }

  const archiveTo = env.MAIL_ARCHIVE_TO;
  // Mail addressed to the archive address itself only reaches this Worker when
  // its literal rule is missing. Re-posting it to that same address would loop.
  if (archiveTo && !sameAddress(message.to, archiveTo)) {
    await attempt(message, archiveTo);
  }

  // The normal delivery above remains authoritative. Board Mail storage is a
  // best-effort copy so a parser or R2 failure cannot bounce mail already delivered.
  if (env.SUBMISSIONS && message.raw) {
    try {
      const raw = await readBounded(message.raw);
      const parsed = await PostalMime.parse(raw, { maxNestingDepth: 20, maxHeadersSize: 65_536, maxPartCount: 100 });
      const sender = parsed.from?.address?.trim().toLowerCase();
      const text = (await emailBodyText(parsed)).slice(0, MAX_STORED_BODY_CHARS);
      if (!sender || !text) throw new Error('missing sender or text body');
      const at = new Date().toISOString();
      const [date] = at.split('T');
      const id = `${Date.now().toString(36)}${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
      const topic = 'email';
      await env.SUBMISSIONS.put(
        `submissions/${date.replaceAll('-', '/')}/${at}-${id}.json`,
        JSON.stringify({
          id, submittedAt: at, topic, name: parsed.from?.name?.trim() || sender,
          email: sender, phone: null, lang: 'en', message: text,
          subject: (parsed.subject?.replace(/[\r\n\t]/g, ' ').trim().slice(0, 150)) || '(no subject)', replyFrom: message.to.trim().toLowerCase(),
          replies: [],
        }),
      );
      console.log(`inbound mail: inbox stored id=${id}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`inbound mail: inbox store failed: ${detail}`);
    }
  }
}
