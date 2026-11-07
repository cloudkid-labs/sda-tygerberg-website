import type { Block, BlockType, ChurchEvent, DepartmentHead, Page } from './types';

/**
 * What one save changed, item by item, for the members' Recent changes list
 * (C-70). Stored with the audit line so a removed item keeps its name, and
 * rendered per language by the client — the server stores keys, not prose.
 */
export type AuditChange =
  | { op: 'added' | 'removed' | 'published' | 'unpublished' | 'shown' | 'hidden'; label: string; block?: BlockRef }
  /** `from` is the old name when the edit renamed the item: "from → label". */
  | { op: 'edited'; label: string; fields: string[]; from?: string; block?: BlockRef }
  | { op: 'moved'; label: string; from: number; to: number; block?: BlockRef };

/** A page block, by 1-based position and type; the label is then empty. */
export type BlockRef = { n: number; type: BlockType };

/** Stamps and list position are bookkeeping, not content. */
const BOOKKEEPING = new Set(['id', 'order', 'updatedBy', 'updatedAt', 'status', 'visible']);

function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/** Top-level keys whose content differs, in a stable order. */
export function changedFields(before: object, after: object, skip: Set<string> = BOOKKEEPING): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((k) => !skip.has(k))
    .filter((k) => canonical((before as Record<string, unknown>)[k]) !== canonical((after as Record<string, unknown>)[k]))
    .sort();
}

/** Longest common subsequence of two key lists, as the set of matched keys. */
function lcs(a: string[], b: string[]): Set<string> {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.add(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

type Flag<T> = { on: 'published' | 'shown'; off: 'unpublished' | 'hidden'; isOn: (item: T) => boolean };

/**
 * Added, removed, edited (with field names), moved (only the items that
 * actually moved — the rest of the list shifting around them is not a move)
 * and on/off switches such as draft ↔ live.
 */
function diffList<T extends { id: string }>(before: T[], after: T[], label: (item: T) => string, flag: Flag<T>): AuditChange[] {
  const prev = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const changes: AuditChange[] = [];

  for (const item of after) {
    const old = prev.get(item.id);
    if (!old) {
      changes.push({ op: 'added', label: label(item) });
      if (flag.isOn(item) && flag.on === 'published') changes.push({ op: 'published', label: label(item) });
      if (!flag.isOn(item) && flag.on === 'shown') changes.push({ op: 'hidden', label: label(item) });
      continue;
    }
    const fields = changedFields(old, item);
    if (fields.length) {
      const was = label(old);
      changes.push({ op: 'edited', label: label(item), fields, ...(was !== label(item) ? { from: was } : {}) });
    }
    if (flag.isOn(old) !== flag.isOn(item)) changes.push({ op: flag.isOn(item) ? flag.on : flag.off, label: label(item) });
  }
  for (const item of before) if (!next.has(item.id)) changes.push({ op: 'removed', label: label(item) });

  const keptBefore = before.filter((i) => next.has(i.id)).map((i) => i.id);
  const keptAfter = after.filter((i) => prev.has(i.id)).map((i) => i.id);
  const stayed = lcs(keptBefore, keptAfter);
  for (const id of keptAfter) {
    if (stayed.has(id)) continue;
    changes.push({
      op: 'moved',
      label: label(next.get(id)!),
      from: before.findIndex((i) => i.id === id) + 1,
      to: after.findIndex((i) => i.id === id) + 1,
    });
  }
  return changes;
}

const eventLabel = (e: Pick<ChurchEvent, 'id' | 'name'>) => e.name?.af || e.name?.en || e.id;
const headLabel = (h: Pick<DepartmentHead, 'id' | 'name'>) => h.name || h.id;

export function diffEvents(before: Pick<ChurchEvent, 'id' | 'name' | 'status'>[], after: Pick<ChurchEvent, 'id' | 'name' | 'status'>[]): AuditChange[] {
  return diffList(before, after, eventLabel, { on: 'published', off: 'unpublished', isOn: (e) => e.status === 'live' });
}

export function diffHeads(before: Pick<DepartmentHead, 'id' | 'name' | 'visible'>[], after: Pick<DepartmentHead, 'id' | 'name' | 'visible'>[]): AuditChange[] {
  return diffList(before, after, headLabel, { on: 'shown', off: 'hidden', isOn: (h) => h.visible });
}

// ---- Order around a move-only save ---------------------------------------------

/**
 * The list's order before and after a save that only moved things, stored
 * with its audit line so back-to-back moves can be shown as one (auditMerge):
 * a swap is ambiguous — either item "moved" — so chaining the named moves is
 * not enough; the orders are. Keys are item ids, or for page blocks (which
 * have no id) a short hash of the block's content; `names` labels each key
 * (an item's name, a block's type).
 */
export type AuditOrder = { kind: 'list' | 'blocks'; before: string[]; after: string[]; names: Record<string, string> };

type Move = Extract<AuditChange, { op: 'moved' }>;

/** Only a save whose every change is a move carries its order. */
export const isMoveOnly = (changes: AuditChange[]) => changes.length > 0 && changes.every((c) => c.op === 'moved');

function listOrder<T extends { id: string }>(before: T[], after: T[], label: (item: T) => string): AuditOrder {
  const names: Record<string, string> = {};
  for (const item of [...before, ...after]) names[item.id] = label(item);
  return { kind: 'list', before: before.map((i) => i.id), after: after.map((i) => i.id), names };
}

export const eventsOrder = (before: Pick<ChurchEvent, 'id' | 'name'>[], after: Pick<ChurchEvent, 'id' | 'name'>[]) =>
  listOrder(before, after, eventLabel);
export const headsOrder = (before: Pick<DepartmentHead, 'id' | 'name'>[], after: Pick<DepartmentHead, 'id' | 'name'>[]) =>
  listOrder(before, after, headLabel);

/** FNV-1a, 32-bit, as hex: enough to tell a page's blocks apart. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function blockKeys(blocks: Block[], names: Record<string, string>): string[] {
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    const content = canonical(b);
    const n = (seen.get(content) ?? 0) + 1;
    seen.set(content, n);
    const key = shortHash(`${n}:${content}`);
    names[key] = b.type;
    return key;
  });
}

export function pageOrder(before: Pick<Page, 'blocks'>, after: Pick<Page, 'blocks'>): AuditOrder {
  const names: Record<string, string> = {};
  return { kind: 'blocks', before: blockKeys(before.blocks, names), after: blockKeys(after.blocks, names), names };
}

/**
 * The moves between two orders, as the diff names them: only what left the
 * longest unchanged run moved, with 1-based positions.
 */
export function movesBetween(o: AuditOrder): Move[] {
  const next = new Set(o.after);
  const prev = new Set(o.before);
  const keptBefore = o.before.filter((k) => next.has(k));
  const keptAfter = o.after.filter((k) => prev.has(k));
  const stayed = lcs(keptBefore, keptAfter);
  const out: Move[] = [];
  for (const k of keptAfter) {
    if (stayed.has(k)) continue;
    const from = o.before.indexOf(k) + 1;
    const to = o.after.indexOf(k) + 1;
    out.push(
      o.kind === 'blocks'
        ? { op: 'moved', label: '', from, to, block: { n: to, type: o.names[k] as BlockType } }
        : { op: 'moved', label: o.names[k] ?? k, from, to },
    );
  }
  return out;
}

/**
 * Page fields, then blocks. Blocks carry no id, so the longest run of
 * unchanged blocks is matched by content first. Of the rest, an identical
 * block elsewhere is a move, a block of the same type is an edit, and what
 * is left was added or removed.
 */
export function diffPage(before: Page | null, after: Page): AuditChange[] {
  if (!before) return [];
  const changes: AuditChange[] = [];
  const fields = changedFields(before, after, new Set([...BOOKKEEPING, 'blocks']));
  if (fields.length) {
    // A retitled page reads "old → new"; otherwise it is just "Page".
    const title = (p: Page) => p.title.af || p.title.en;
    const renamed = fields.includes('title') && title(before) !== title(after);
    changes.push({ op: 'edited', label: renamed ? title(after) : '', fields, ...(renamed ? { from: title(before) } : {}) });
  }

  // Identical blocks can repeat; make each occurrence a distinct key.
  const keyed = (blocks: Block[]) => {
    const seen = new Map<string, number>();
    return blocks.map((b, i) => {
      const content = canonical(b);
      const n = (seen.get(content) ?? 0) + 1;
      seen.set(content, n);
      return { b, i, content, key: `${n}:${content}` };
    });
  };
  const A = keyed(before.blocks);
  const Z = keyed(after.blocks);
  const same = lcs(A.map((x) => x.key), Z.map((x) => x.key));
  const leftA = A.filter((x) => !same.has(x.key));
  const leftZ = Z.filter((x) => !same.has(x.key));
  const ref = (b: Block, i: number): BlockRef => ({ n: i + 1, type: b.type });

  const take = (match: (a: (typeof A)[number]) => boolean) => {
    const k = leftA.findIndex(match);
    return k < 0 ? null : leftA.splice(k, 1)[0];
  };
  const moved = new Map<number, (typeof A)[number]>();
  for (const z of leftZ) {
    const a = take((x) => x.content === z.content);
    if (a) moved.set(z.i, a);
  }
  for (const z of leftZ) {
    const from = moved.get(z.i);
    if (from) {
      changes.push({ op: 'moved', label: '', from: from.i + 1, to: z.i + 1, block: ref(z.b, z.i) });
      continue;
    }
    const a = take((x) => x.b.type === z.b.type);
    if (a) changes.push({ op: 'edited', label: '', fields: changedFields(a.b, z.b, new Set(['type'])), block: ref(z.b, z.i) });
    else changes.push({ op: 'added', label: '', block: ref(z.b, z.i) });
  }
  for (const a of leftA) changes.push({ op: 'removed', label: '', block: ref(a.b, a.i) });
  return changes;
}
