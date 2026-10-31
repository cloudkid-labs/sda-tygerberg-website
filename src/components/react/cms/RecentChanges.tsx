import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy } from '../../../data/cmsCopy';
import { cmsApi, formatWhen } from './ui';

type Entry = { at: string; by: string; action: string; target: string; detail?: string };

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
                <span className="min-w-0 break-words text-ink">
                  <strong>{e.action}</strong> {e.target}
                  {e.detail ? ` — ${e.detail}` : ''} <span className="text-slate-muted">· {e.by}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
