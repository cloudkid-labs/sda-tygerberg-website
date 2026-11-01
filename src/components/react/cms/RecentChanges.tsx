import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill, type CmsCopy } from '../../../data/cmsCopy';
import type { AuditChange } from '../../../lib/cms/auditDiff';
import { cmsApi, formatWhen } from './ui';

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
      return fill(a.edited, { label, fields: list(c.fields.map((f) => a.fields[f] ?? f), a.and) });
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    cmsApi<{ items: Entry[] }>('GET', '/api/cms/audit').then((res) => {
      if (live) setItems(res.ok ? res.data.items : []);
    });
    return () => {
      live = false;
    };
  }, [open, refreshKey]);

  return (
    <details className="mt-10 rounded-card border border-subtle bg-cream-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[14px] font-bold text-navy">{t.recentHeading}</summary>
      <div className="border-t border-subtle px-4 py-3">
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
      </div>
    </details>
  );
}
