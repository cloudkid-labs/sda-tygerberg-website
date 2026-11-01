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
