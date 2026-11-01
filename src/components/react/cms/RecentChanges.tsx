import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill, type CmsCopy } from '../../../data/cmsCopy';
import type { AuditChange } from '../../../lib/cms/auditDiff';
import { buttonSecondary, cmsApi, formatWhen } from './ui';

const PAGE_SIZES = [10, 25, 50] as const;
type PageSize = (typeof PAGE_SIZES)[number];
type AuditPage = { items: Entry[]; next: string | null };

type Entry = { at: string; by: string; action: string; target: string; detail?: string; changes?: AuditChange[] };

/** Events and heads are named by the action; pages and photos by the target. */
const SHOWS_TARGET = new Set(['page.create', 'page.save', 'page.publish', 'page.unpublish', 'media.upload']);

function list(words: string[], and: string): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} ${and} ${words[words.length - 1]}`;
}

/** One change as a sentence in the reader's language. */
export function describeChange(c: AuditChange, t: CmsCopy): string {
  const a = t.audit;
  const label = c.block ? fill(a.block, { n: c.block.n, type: t.blocks[c.block.type] ?? c.block.type }) : c.label || a.page;
  switch (c.op) {
    case 'edited':
      return fill(a.edited, {
        label: c.from ? `${c.from} → ${label}` : label,
        fields: list(c.fields.map((f) => a.fields[f] ?? f), a.and),
      });
    case 'moved':
      return fill(a.moved, { label, from: c.from, to: c.to });
    default:
      return fill(a[c.op], { label });
  }
}

/**
 * The audit trail (C-70): who changed what, when — newest first, from the
 * append-only log the API writes on every save. Members only, like every
 * address in it.
 */
export function RecentChanges({ refreshKey }: { refreshKey: string }) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  const [items, setItems] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [size, setSize] = useState<PageSize>(10);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const page = (cursor: string | null) =>
    cmsApi<AuditPage>('GET', `/api/cms/audit?limit=${size}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);

  // First page again whenever the list is opened, an editor saves, or the
  // page size changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    page(null).then((res) => {
      if (!live) return;
      setItems(res.ok ? res.data.items : []);
      setNext(res.ok ? res.data.next : null);
      setFailed(!res.ok);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey, size]);

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await page(next);
    setLoadingMore(false);
    if (!res.ok) return setFailed(true);
    setItems((list) => [...(list ?? []), ...res.data.items]);
    setNext(res.data.next);
  }

  return (
    <details className="mt-10 rounded-card border border-subtle bg-cream-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[14px] font-bold text-navy">{t.recentHeading}</summary>
      <div className="border-t border-subtle px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span aria-live="polite" className="text-[12.5px] text-slate-muted">
            {items && items.length > 0 ? fill(t.recentShowing, { n: items.length }) : ''}
          </span>
          <label className="flex items-center gap-2 text-[13px] font-bold text-navy">
            {t.recentPerPage}
            <select
              className="min-h-11 rounded-xl border border-strong bg-white px-3 text-[15px] text-ink focus:border-navy focus:outline-none focus:ring-[3px] focus:ring-navy/15"
              value={size}
              onChange={(e) => setSize(Number(e.target.value) as PageSize)}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {failed && <p className="mb-2 text-[13.5px] text-[#9a4f0f]">{t.errLoad}</p>}
        {items === null ? null : items.length === 0 ? (
          <p className="text-[13.5px] text-slate-muted">{t.recentEmpty}</p>
        ) : (
          <ul className="grid gap-2 text-[13px]">
            {items.map((e, i) => (
              <li key={i} className="grid gap-0.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-3">
                <span className="tabular-nums text-slate-muted">{formatWhen(e.at, lang)}</span>
                <div className="min-w-0 break-words text-ink">
                  <strong>{t.audit.actions[e.action] ?? e.action}</strong>
                  {SHOWS_TARGET.has(e.action) ? ` ${e.target}` : ''} <span className="text-slate-muted">· {e.by}</span>
                  {e.changes?.length ? (
                    <ul className="mt-0.5 list-disc pl-5 text-ink">
                      {e.changes.map((c, k) => (
                        <li key={k}>{describeChange(c, t)}</li>
                      ))}
                    </ul>
                  ) : e.detail ? (
                    <span> — {e.detail}</span>
                  ) : SHOWS_TARGET.has(e.action) ? null : (
                    <span className="text-slate-muted"> — {t.recentNoDetail}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {next && (
          <div className="mt-3">
            <button type="button" className={buttonSecondary} disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? t.recentLoading : fill(t.recentMore, { n: size })}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
