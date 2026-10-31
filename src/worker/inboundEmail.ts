/// <reference types="@cloudflare/workers-types" />

import PostalMime from 'postal-mime';
import { decodeHtmlEntities } from './htmlEntities';

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
  'h3', 'h4', 'h5', 'h6', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul',
]);
const HIDDEN_EMAIL_CONTAINERS = new Set([
  'head', 'script', 'style', 'title', 'noscript', 'template', 'svg', 'canvas',
  'iframe', 'object',
]);
const HIDDEN_EMAIL_VOID_ELEMENTS = new Set(['meta', 'link', 'embed']);
const VOID_EMAIL_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const HEAD_CONTENT_EMAIL_ELEMENTS = new Set([
  'base', 'basefont', 'bgsound', 'link', 'meta', 'noframes', 'noscript',
  'script', 'style', 'template', 'title',
]);
const P_AUTO_CLOSE_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'button', 'details', 'dialog',
  'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main',
  'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'table', 'ul',
]);

type EmailScopeKind = 'list' | 'table' | 'definition-list' | 'select' | 'ruby';
type EmailClosureRule = { tags: ReadonlySet<string>; scope?: EmailScopeKind };
const SCOPE_CONTAINER_KIND: Record<string, EmailScopeKind> = {
  ul: 'list',
  ol: 'list',
  menu: 'list',
  table: 'table',
  dl: 'definition-list',
  select: 'select',
  datalist: 'select',
  ruby: 'ruby',
};
const OPTIONAL_CONTENT_SCOPE_KIND: Record<string, EmailScopeKind> = {
  li: 'list',
  dt: 'definition-list',
  dd: 'definition-list',
  td: 'table',
  th: 'table',
  tr: 'table',
  thead: 'table',
  tbody: 'table',
  tfoot: 'table',
  colgroup: 'table',
  option: 'select',
  optgroup: 'select',
  rt: 'ruby',
  rp: 'ruby',
};
const END_TAG_SCOPE_KIND: Record<string, EmailScopeKind> = {
  ul: 'list',
  ol: 'list',
  menu: 'list',
  table: 'table',
  dl: 'definition-list',
  select: 'select',
  datalist: 'select',
  ruby: 'ruby',
  option: 'select',
  optgroup: 'select',
  td: 'table',
  th: 'table',
  tr: 'table',
  thead: 'table',
  tbody: 'table',
  tfoot: 'table',
  colgroup: 'table',
};
const IMPLIED_CLOSES_ON_START: Record<string, EmailClosureRule> = {
  dd: { tags: new Set(['dd', 'dt']), scope: 'definition-list' },
  dt: { tags: new Set(['dd', 'dt']), scope: 'definition-list' },
  li: { tags: new Set(['li']), scope: 'list' },
  optgroup: { tags: new Set(['optgroup']), scope: 'select' },
  option: { tags: new Set(['option', 'optgroup']), scope: 'select' },
  p: { tags: P_AUTO_CLOSE_TAGS },
  rp: { tags: new Set(['rp', 'rt']), scope: 'ruby' },
  rt: { tags: new Set(['rp', 'rt']), scope: 'ruby' },
  colgroup: { tags: new Set(['colgroup']), scope: 'table' },
  td: { tags: new Set(['td', 'th', 'tr', 'thead', 'tbody', 'tfoot']), scope: 'table' },
  th: { tags: new Set(['td', 'th', 'tr', 'thead', 'tbody', 'tfoot']), scope: 'table' },
  tr: { tags: new Set(['tr', 'thead', 'tbody', 'tfoot']), scope: 'table' },
  thead: { tags: new Set(['tbody', 'tfoot']), scope: 'table' },
  tbody: { tags: new Set(['tbody', 'thead', 'tfoot']), scope: 'table' },
  tfoot: { tags: new Set(['tbody', 'thead']), scope: 'table' },
};
const IMPLIED_CLOSES_ON_END: Record<string, EmailClosureRule> = {
  dd: { tags: new Set(['dl']), scope: 'definition-list' },
  dt: { tags: new Set(['dl']), scope: 'definition-list' },
  head: { tags: new Set(['body']) },
  li: { tags: new Set(['ol', 'ul', 'menu']), scope: 'list' },
  optgroup: { tags: new Set(['select', 'datalist']), scope: 'select' },
  option: { tags: new Set(['optgroup', 'select', 'datalist']), scope: 'select' },
  p: { tags: new Set([...P_AUTO_CLOSE_TAGS, 'body', 'li', 'dd', 'dt', 'option', 'td', 'th', 'tr']) },
  rp: { tags: new Set(['ruby']), scope: 'ruby' },
  rt: { tags: new Set(['ruby']), scope: 'ruby' },
  colgroup: { tags: new Set(['table']), scope: 'table' },
  td: { tags: new Set(['tr', 'thead', 'tbody', 'tfoot', 'table']), scope: 'table' },
  th: { tags: new Set(['tr', 'thead', 'tbody', 'tfoot', 'table']), scope: 'table' },
  tr: { tags: new Set(['thead', 'tbody', 'tfoot', 'table']), scope: 'table' },
  thead: { tags: new Set(['table']), scope: 'table' },
  tbody: { tags: new Set(['table']), scope: 'table' },
  tfoot: { tags: new Set(['table']), scope: 'table' },
};
const OPTIONAL_CLOSURE_END_TAGS = new Set([
  ...P_AUTO_CLOSE_TAGS, 'body', 'ol', 'ul', 'menu', 'dl', 'ruby', 'optgroup',
  'select', 'datalist', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'li', 'dd', 'dt', 'option',
]);

function stripInlineCssComments(style: string): string {
  const result: string[] = [];
  let quote = '';
  let escaped = false;

  for (let index = 0; index < style.length; index++) {
    const character = style[index];
    if (escaped) {
      result.push(character);
      if (character === '\r' && style[index + 1] === '\n') {
        result.push(style[index + 1]);
        index++;
      }
      escaped = false;
      continue;
    }
    if (character === '\\') {
      result.push(character);
      escaped = true;
      continue;
    }
    if (quote) {
      result.push(character);
      if (character === quote || character === '\n' || character === '\r' || character === '\f') quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      result.push(character);
      continue;
    }
    if (character === '/' && style[index + 1] === '*') {
      const commentEnd = style.indexOf('*/', index + 2);
      if (commentEnd < 0) break;
      result.push(' ');
      index = commentEnd + 1;
      continue;
    }
    result.push(character);
  }

  return result.join('');
}

function splitInlineCssDeclarations(style: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;

  for (let index = 0; index < style.length; index++) {
    const character = style[index];
    if (escaped) {
      if (character === '\r' && style[index + 1] === '\n') index++;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote || character === '\n' || character === '\r' || character === '\f') quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '(') {
      parentheses++;
    } else if (character === ')' && parentheses > 0) {
      parentheses--;
    } else if (character === '[') {
      brackets++;
    } else if (character === ']' && brackets > 0) {
      brackets--;
    } else if (character === '{') {
      braces++;
    } else if (character === '}' && braces > 0) {
      braces--;
    } else if (character === ';' && parentheses === 0 && brackets === 0 && braces === 0) {
      declarations.push(style.slice(start, index));
      start = index + 1;
    }
  }

  declarations.push(style.slice(start));
  return declarations;
}

const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'revert', 'revert-layer', 'unset']);
const DISPLAY_OUTSIDE = new Set(['block', 'inline', 'run-in']);
const DISPLAY_INSIDE = new Set(['flow', 'flow-root', 'table', 'flex', 'grid', 'ruby']);
const DISPLAY_INTERNAL = new Set([
  'table-row-group', 'table-header-group', 'table-footer-group', 'table-row',
  'table-cell', 'table-column-group', 'table-column', 'table-caption',
  'ruby-base', 'ruby-text', 'ruby-base-container', 'ruby-text-container',
]);
const DISPLAY_LEGACY = new Set([
  'inline-block', 'inline-table', 'inline-flex', 'inline-grid',
  '-webkit-box', '-webkit-inline-box', '-webkit-flex', '-webkit-inline-flex',
]);

function isValidPresentationValue(property: string, value: string): boolean {
  if (CSS_WIDE_KEYWORDS.has(value)) return true;
  if (property === 'visibility') {
    return value === 'visible' || value === 'hidden' || value === 'collapse';
  }
  if (property === 'content-visibility') {
    return value === 'visible' || value === 'auto' || value === 'hidden';
  }
  if (property !== 'display') return false;
  if (value === 'none' || value === 'contents' || DISPLAY_INTERNAL.has(value) || DISPLAY_LEGACY.has(value)) {
    return true;
  }

  let outsideCount = 0;
  let insideCount = 0;
  let insideValue = '';
  let listItemCount = 0;
  for (const token of value.split(/\s+/)) {
    if (DISPLAY_OUTSIDE.has(token)) outsideCount++;
    else if (DISPLAY_INSIDE.has(token)) {
      insideCount++;
      insideValue = token;
    }
    else if (token === 'list-item') listItemCount++;
    else return false;
  }

  return outsideCount <= 1 && insideCount <= 1 && listItemCount <= 1 &&
    (listItemCount === 0 || insideCount === 0 || insideValue === 'flow' || insideValue === 'flow-root') &&
    (outsideCount + insideCount + listItemCount > 0);
}

function winningInlineStyleValue(style: string, requestedProperty: string): string | undefined {
  let winner: { value: string; important: boolean } | undefined;

  for (const declaration of splitInlineCssDeclarations(stripInlineCssComments(style))) {
    const separator = declaration.indexOf(':');
    if (separator < 0 || declaration.slice(0, separator).trim().toLowerCase() !== requestedProperty) {
      continue;
    }

    let value = declaration.slice(separator + 1).trim();
    const important = /\s*!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important\s*$/i, '').trim();
    value = value.toLowerCase();
    if (!isValidPresentationValue(requestedProperty, value)) continue;

    if (!winner || (important && !winner.important) || important === winner.important) {
      winner = { value, important };
    }
  }

  return winner?.value;
}

function hasHiddenEmailPresentation(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true') return true;

  const style = element.getAttribute('style') ?? '';
  const display = winningInlineStyleValue(style, 'display');
  const contentVisibility = winningInlineStyleValue(style, 'content-visibility');

  return display === 'none' || contentVisibility === 'hidden';
}

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
  const hiddenElements: Array<{
    id: number;
    tag: string;
    scopeKind?: EmailScopeKind;
    scopeId: number | null;
  }> = [];
  const visibilityOverrides: Array<{
    id: number;
    tag: string;
    hidden: boolean;
    scopeKind?: EmailScopeKind;
    scopeId: number | null;
  }> = [];
  const scopeStacks: Record<EmailScopeKind, number[]> = {
    list: [],
    table: [],
    'definition-list': [],
    select: [],
    ruby: [],
  };
  let hiddenElementId = 0;
  let visibilityOverrideId = 0;
  let scopeId = 0;

  const currentScope = (kind?: EmailScopeKind): number | null =>
    kind ? scopeStacks[kind][scopeStacks[kind].length - 1] ?? null : null;

  const closeScope = (kind: EmailScopeKind, id: number): void => {
    const index = scopeStacks[kind].lastIndexOf(id);
    if (index >= 0) scopeStacks[kind].splice(index);
  };

  const closeHiddenElement = (id: number): void => {
    const index = hiddenElements.findIndex((hidden) => hidden.id === id);
    if (index >= 0) hiddenElements.splice(index);
  };

  const closeVisibilityOverride = (id: number): void => {
    const index = visibilityOverrides.findIndex((override) => override.id === id);
    if (index >= 0) visibilityOverrides.splice(index);
  };

  const closeVisibilityOverridesOnStart = (nextTag: string): void => {
    for (let index = visibilityOverrides.length - 1; index >= 0; index -= 1) {
      const override = visibilityOverrides[index];
      const rule = IMPLIED_CLOSES_ON_START[override.tag];
      if (!rule?.tags.has(nextTag)) continue;
      if (
        rule.scope &&
        (override.scopeKind !== rule.scope || override.scopeId !== currentScope(rule.scope))
      ) {
        continue;
      }
      visibilityOverrides.splice(index);
      return;
    }
  };

  const closeVisibilityOverridesOnEnd = (
    endTag: string,
    scopeKind?: EmailScopeKind,
    scopeId: number | null = null,
  ): void => {
    for (let index = visibilityOverrides.length - 1; index >= 0; index -= 1) {
      const override = visibilityOverrides[index];
      const rule = IMPLIED_CLOSES_ON_END[override.tag];
      if (!rule?.tags.has(endTag)) continue;
      if (
        rule.scope &&
        (override.scopeKind !== rule.scope || override.scopeId !== scopeId || scopeKind !== rule.scope)
      ) {
        continue;
      }
      visibilityOverrides.splice(index);
      return;
    }
  };

  const closeImplicitlyOnStart = (nextTag: string): void => {
    const headIndex = hiddenElements.findIndex((hidden) => hidden.tag === 'head');
    if (
      headIndex >= 0 &&
      nextTag !== 'html' &&
      nextTag !== 'head' &&
      !HEAD_CONTENT_EMAIL_ELEMENTS.has(nextTag)
    ) {
      hiddenElements.splice(headIndex);
      return;
    }

    for (let index = hiddenElements.length - 1; index >= 0; index -= 1) {
      const hidden = hiddenElements[index];
      const rule = IMPLIED_CLOSES_ON_START[hidden.tag];
      if (!rule?.tags.has(nextTag)) continue;
      if (
        rule.scope &&
        (hidden.scopeKind !== rule.scope || hidden.scopeId !== currentScope(rule.scope))
      ) {
        continue;
      }
      hiddenElements.splice(index);
      return;
    }
  };

  const closeImplicitlyOnEnd = (
    endTag: string,
    scopeKind?: EmailScopeKind,
    scopeId: number | null = null,
  ): void => {
    for (let index = hiddenElements.length - 1; index >= 0; index -= 1) {
      const hidden = hiddenElements[index];
      const rule = IMPLIED_CLOSES_ON_END[hidden.tag];
      if (!rule?.tags.has(endTag)) continue;
      if (
        rule.scope &&
        (hidden.scopeKind !== rule.scope || hidden.scopeId !== scopeId || scopeKind !== rule.scope)
      ) {
        continue;
      }
      hiddenElements.splice(index);
      return;
    }
  };

  const transformed = new HTMLRewriter()
    .on('*', {
      element(element) {
        const tag = element.tagName.toLowerCase();
        closeImplicitlyOnStart(tag);
        closeVisibilityOverridesOnStart(tag);

        const openedScopeKind = SCOPE_CONTAINER_KIND[tag];
        const openedScopeId = openedScopeKind ? ++scopeId : null;
        if (openedScopeKind && openedScopeId !== null) {
          scopeStacks[openedScopeKind].push(openedScopeId);
        }
        const endScopeKind = openedScopeKind ?? END_TAG_SCOPE_KIND[tag];
        const endScopeId = openedScopeKind ? openedScopeId : currentScope(endScopeKind);

        if (OPTIONAL_CLOSURE_END_TAGS.has(tag) && !VOID_EMAIL_ELEMENTS.has(tag)) {
          element.onEndTag(() => {
            closeImplicitlyOnEnd(tag, endScopeKind, endScopeId);
            closeVisibilityOverridesOnEnd(tag, endScopeKind, endScopeId);
            if (openedScopeKind && openedScopeId !== null) {
              closeScope(openedScopeKind, openedScopeId);
            }
          });
        }
        if (hiddenElements.length > 0) return;
        if (
          HIDDEN_EMAIL_CONTAINERS.has(tag) ||
          HIDDEN_EMAIL_VOID_ELEMENTS.has(tag) ||
          hasHiddenEmailPresentation(element)
        ) {
          if (VOID_EMAIL_ELEMENTS.has(tag)) {
            element.remove();
            return;
          }
          const hiddenScopeKind = OPTIONAL_CONTENT_SCOPE_KIND[tag];
          const hidden = {
            id: ++hiddenElementId,
            tag,
            scopeKind: hiddenScopeKind,
            scopeId: currentScope(hiddenScopeKind),
          };
          hiddenElements.push(hidden);
          element.onEndTag(() => {
            closeHiddenElement(hidden.id);
          });
          element.remove();
          return;
        }

        const style = element.getAttribute('style') ?? '';
        const visibility = winningInlineStyleValue(style, 'visibility');
        const visibilityOverride = visibility === 'hidden' || visibility === 'collapse'
          ? true
          : visibility === 'visible' || visibility === 'initial'
            ? false
            : undefined;
        if (visibilityOverride !== undefined && !VOID_EMAIL_ELEMENTS.has(tag)) {
          const visibilityScopeKind = OPTIONAL_CONTENT_SCOPE_KIND[tag];
          const override = {
            id: ++visibilityOverrideId,
            tag,
            hidden: visibilityOverride,
            scopeKind: visibilityScopeKind,
            scopeId: currentScope(visibilityScopeKind),
          };
          visibilityOverrides.push(override);
          element.onEndTag(() => closeVisibilityOverride(override.id));
        }
        const currentVisibilityHidden =
          visibilityOverride ?? visibilityOverrides[visibilityOverrides.length - 1]?.hidden ?? false;

        if (tag === 'br' || tag === 'hr') {
          chunks.push('\n');
          return;
        }
        if (tag === 'img') {
          const alt = element.getAttribute('alt')?.trim();
          if (alt && !currentVisibilityHidden) chunks.push('[Image: ' + alt + ']');
          element.remove();
          return;
        }
        if (tag === 'td' || tag === 'th') {
          chunks.push(' ');
          element.onEndTag(() => {
            chunks.push(' ');
          });
          return;
        }
        if (tag === 'li') {
          chunks.push('\n- ');
          element.onEndTag(() => {
            chunks.push('\n');
          });
          return;
        }
        if (BLOCK_EMAIL_ELEMENTS.has(tag)) {
          chunks.push('\n');
          element.onEndTag(() => {
            chunks.push('\n');
          });
        }
      },
      text(chunk) {
        if (
          hiddenElements.length === 0 &&
          visibilityOverrides[visibilityOverrides.length - 1]?.hidden !== true &&
          !chunk.removed
        ) {
          chunks.push(chunk.text);
        }
      },
    })
    .transform(new Response(html));

  // Consume the transformed stream so every HTMLRewriter handler runs.
  await transformed.text();
  const visibleText = chunks.join('');
  if (!visibleText.trim()) return '';

  // Decode only after chunks are joined so references split across chunks resolve.
  return normalizeEmailText(decodeHtmlEntities(visibleText));
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
