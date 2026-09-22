/// <reference types="@cloudflare/workers-types" />

/**
 * One line per request: who connected, what they asked for, what came back,
 * and how long it took.
 *
 * The Worker is the only place this can be seen. Analytics answers "how many
 * visitors", not "from where", and `cf-connecting-ip` is gone the moment the
 * response is written unless something writes it down. `wrangler tail` and the
 * Workers Logs view are the only consumers — there is no binding, no fetch, no
 * second system behind this, which is what keeps it a log line rather than a
 * record.
 *
 * The address is personal information under POPIA, and the honest statement of
 * what this does with it is: it prints it into logs that Cloudflare retains on
 * this account's behalf and then drops. No purpose beyond diagnosis, no
 * matching across requests, nothing read back. If the site ever needs more than
 * that, the retention question belongs in SETUP-INSTRUCTIONS next to the
 * consent bucket's, not silently here. C-66
 *
 * Everything the visitor controls is clipped or replaced before it lands:
 * the user agent is truncated (and newline-stripped, so it cannot forge a
 * second line in the tail), the query string is dropped entirely. A log line
 * is attacker-adjacent input by definition; it should never be able to lie
 * about which request it belongs to.
 */

/** What the line carries. Every field is a string so a missing one prints. */
export interface RequestLogFacts {
  method: string;
  /** Path only — the query string may carry a search or, worse, a token. */
  path: string;
  status: number;
  ms: number;
  /** `cf-connecting-ip`: the client address Cloudflare saw. */
  ip: string;
  country: string;
  /** The colo that answered, e.g. `JNB`. */
  colo: string;
  host: string;
  /** `cf-ray`: the id support asks for when something goes wrong. */
  ray: string;
  ua: string;
}

/** Printed where a value is absent — a blank reads as a bug in the line. */
const ABSENT = '-';
const UA_MAX = 100;

/**
 * User agents arrive unbounded and attacker-controlled. Clipped rather than
 * logged whole: 100 characters is enough to tell Chrome from a bot.
 */
export function clipUserAgent(value: string | null): string {
  if (!value) return ABSENT;
  const oneLine = value.replace(/[\r\n]+/g, ' ').trim();
  if (oneLine === '') return ABSENT;
  return oneLine.length > UA_MAX ? `${oneLine.slice(0, UA_MAX)}…` : oneLine;
}

/**
 * The facts, read off the request. Structurally typed rather than taking a
 * `Request` so the tests can hand it one without Cloudflare's `cf` object —
 * and `cf` is `unknown` because the types package models it as the *outgoing*
 * init shape (`CfProperties`), while the object the runtime hands a Worker
 * carries the full `IncomingRequestCfProperties`. Narrowed here, once.
 */
export function requestFacts(
  request: {
    url: string;
    method: string;
    headers: Headers;
    cf?: unknown;
  },
  status: number,
  ms: number,
): RequestLogFacts {
  const url = new URL(request.url);
  const cf = request.cf as { colo?: string; country?: string } | undefined;
  return {
    method: request.method,
    path: url.pathname,
    status,
    ms,
    ip: request.headers.get('cf-connecting-ip') ?? ABSENT,
    country: cf?.country ?? ABSENT,
    colo: cf?.colo ?? ABSENT,
    host: url.hostname,
    ray: request.headers.get('cf-ray') ?? ABSENT,
    ua: clipUserAgent(request.headers.get('user-agent')),
  };
}

/**
 * The line itself. One line, always — the tail splits on newlines, so anything
 * that could introduce one has already been replaced by the time this runs,
 * and the final guard is the belt to `clipUserAgent`'s braces.
 */
export function requestLogLine(facts: RequestLogFacts): string {
  const line =
    `request: ip=${facts.ip} country=${facts.country} colo=${facts.colo}` +
    ` host=${facts.host} method=${facts.method} path=${facts.path}` +
    ` status=${facts.status} ms=${facts.ms} ray=${facts.ray} ua=${facts.ua}`;
  return line.replace(/[\r\n]+/g, ' ');
}

/**
 * What actually reaches `console.log`: an object, not a string.
 *
 * Workers Logs extracts the *fields* of a logged object — `ip`, `status`, `path`
 * become columns you can filter on. Log a stringified object instead and the
 * whole thing lands in one `message` field, which is the same as logging prose.
 * That distinction is the entire reason this returns an object.
 *
 * `level` is in the payload rather than left to the console method, so the
 * entry is level `log` by construction. `message` keeps the human line, so
 * `wrangler tail` still reads like a sentence.
 */
export function requestLogEntry(facts: RequestLogFacts): Record<string, unknown> {
  return {
    level: 'log',
    message: requestLogLine(facts),
    ...facts,
  };
}
