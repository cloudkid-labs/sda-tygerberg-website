import { isMoveOnly, movesBetween, type AuditChange, type AuditOrder } from './auditDiff';

/** The shape the Recent changes list reads; the stored line is never changed. */
export type MergeableEntry = {
  at: string;
  by: string;
  action: string;
  target: string;
  detail?: string;
  changes?: AuditChange[];
  order?: AuditOrder;
};

/** Adjacent saves further apart than this stay separate entries. */
export const MOVE_MERGE_WINDOW_MS = 60 * 60 * 1000;

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

const mergeable = (e: MergeableEntry): e is MergeableEntry & { order: AuditOrder } =>
  !e.detail && Boolean(e.order) && isMoveOnly(e.changes ?? []);

/**
 * Back-to-back saves that only moved things, by the same person, on the same
 * list or page, within the window, read as one entry (C-70) — moving a card
 * up three places in three saves is one change, not three. Two saves join
 * only when one picks up exactly where the other left off (its order before
 * is the other's order after), and the entry then shows the moves from the
 * first order to the last, as one save would have. Moves that cancel out
 * leave no entry, as a save that changed nothing writes none.
 *
 * `entries` is newest first, as the API returns them; a merged entry keeps
 * the newest time. Lines without an order (older ones, anything but a pure
 * move) are shown as stored. Display only: the audit log is untouched.
 */
export function mergeMoves<T extends MergeableEntry>(entries: T[]): T[] {
  const out: T[] = [];
  // newest: the run's newest entry; before: the order before its oldest save.
  let run: { newest: T & { order: AuditOrder }; before: string[]; names: Record<string, string>; oldestAt: number; size: number } | null =
    null;
  const flush = () => {
    if (!run) return;
    if (run.size === 1) out.push(run.newest);
    else {
      const { kind, after } = run.newest.order;
      const order: AuditOrder = { kind, before: run.before, after, names: run.names };
      const changes = movesBetween(order);
      if (changes.length) out.push({ ...run.newest, changes, order });
    }
    run = null;
  };
  for (const e of entries) {
    if (!mergeable(e)) {
      flush();
      out.push(e);
      continue;
    }
    const at = Date.parse(e.at);
    const gap = run ? run.oldestAt - at : NaN;
    const joins =
      run !== null &&
      run.newest.by === e.by &&
      run.newest.action === e.action &&
      run.newest.target === e.target &&
      run.newest.order.kind === e.order.kind &&
      gap >= 0 &&
      gap <= MOVE_MERGE_WINDOW_MS &&
      sameList(e.order.after, run.before);
    if (joins) {
      run!.before = e.order.before;
      run!.names = { ...e.order.names, ...run!.names };
      run!.oldestAt = at;
      run!.size++;
    } else {
      flush();
      run = { newest: e, before: e.order.before, names: e.order.names, oldestAt: at, size: 1 };
    }
  }
  flush();
  return out;
}
