/// <reference types="@cloudflare/workers-types" />

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
};

/**
 * The slice of `ForwardableEmailMessage` this module uses. A `Pick` rather than
 * a hand-rolled shape: the platform signature for `forward()` has already
 * moved once — it returns `EmailSendResult` now, not `void` — and this way the
 * real type stays the source of truth.
 */
export type InboundEmailMessage = Pick<ForwardableEmailMessage, 'to' | 'forward' | 'setReject'>;

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
}
