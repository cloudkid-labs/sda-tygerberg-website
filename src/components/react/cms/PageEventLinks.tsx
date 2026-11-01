import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill } from '../../../data/cmsCopy';
import type { ChurchEvent } from '../../../lib/cms/types';
import { Alert, buttonSecondary, cmsApi, inputClass, StatusBadge, TextInput } from './ui';

type Unstamped = Omit<ChurchEvent, 'updatedBy' | 'updatedAt'>;
const strip = (items: ChurchEvent[]): Unstamped[] => items.map(({ updatedBy: _b, updatedAt: _a, ...rest }) => rest);
const nameOf = (e: ChurchEvent) => e.name.af || e.name.en || e.id;

/**
 * The other side of the This week card → page link: from a saved page, link a
 * This week card to it or unlink one. Writes the events list through the same
 * API (and the same rule: a live card can only point at a published page).
 */
export function PageEventLinks({ slug, pageLive, onLinkedChange }: { slug: string; pageLive: boolean; onLinkedChange?: (liveLinks: number) => void }) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  const [events, setEvents] = useState<ChurchEvent[] | null>(null);
  const [rev, setRev] = useState(0);
  const [pick, setPick] = useState('');
  const [labelAf, setLabelAf] = useState('Sien meer');
  const [labelEn, setLabelEn] = useState('See more');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await cmsApi<{ rev: number; items: ChurchEvent[] }>('GET', '/api/cms/events');
    if (!res.ok) return setError(t.errLoad);
    setEvents(res.data.items);
    setRev(res.data.rev);
  }, [t]);

  useEffect(() => {
    setPick('');
    setNote('');
    setError('');
    void load();
    // Reload per page only; a language switch must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const linked = (events ?? []).filter((e) => e.link?.pageSlug === slug);
  const others = (events ?? []).filter((e) => e.link?.pageSlug !== slug);
  const chosen = others.find((e) => e.id === pick) ?? null;
  const blocked = Boolean(chosen && chosen.status === 'live' && !pageLive);

  const liveLinks = linked.filter((e) => e.status === 'live').length;
  useEffect(() => {
    onLinkedChange?.(liveLinks);
  }, [liveLinks, onLinkedChange]);

  async function write(next: Unstamped[], done: string) {
    setBusy(true);
    setError('');
    const res = await cmsApi<{ rev: number; items: ChurchEvent[] }>('PUT', '/api/cms/events', { rev, items: next });
    setBusy(false);
    if (res.ok) {
      setEvents(res.data.items);
      setRev(res.data.rev);
      setPick('');
      setNote(done);
      return;
    }
    if (res.status === 409) {
      setError(t.errConflict);
      await load();
    } else setError(res.status === 400 ? t.plErrDeadLink : t.errSave);
  }

  function link() {
    if (!events || !chosen || blocked) return;
    const label = { af: labelAf.trim() || 'Sien meer', en: labelEn.trim() || 'See more' };
    const next = strip(events).map((e) => (e.id === chosen.id ? { ...e, link: { pageSlug: slug, label } } : e));
    void write(next, fill(t.plLinked, { name: nameOf(chosen) }));
  }

  function unlink(id: string) {
    if (!events) return;
    const target = events.find((e) => e.id === id);
    const next = strip(events).map((e) => {
      if (e.id !== id) return e;
      const { link: _l, ...rest } = e;
      return rest;
    });
    void write(next, fill(t.plUnlinked, { name: target ? nameOf(target) : id }));
  }

  return (
    <fieldset className="mb-6 grid min-w-0 gap-3 rounded-xl border border-subtle p-4">
      <legend className="px-1 text-[12px] font-bold uppercase tracking-[.1em] text-slate-muted">{t.plHeading}</legend>
      {error && <Alert>{error}</Alert>}
      {events === null ? null : (
        <>
          {linked.length === 0 ? (
            <p className="text-[13.5px] text-slate-muted">{t.plNone}</p>
          ) : (
            <ul className="grid gap-2">
              {linked.map((e) => (
                <li key={e.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[10px] bg-white px-3 py-2 text-[14px]">
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(e)} <span className="text-slate-muted">· “{e.link?.label[lang]}”</span>
                  </span>
                  <StatusBadge live={e.status === 'live'} liveLabel={t.live} draftLabel={t.draft} />
                  <button type="button" className="min-h-11 px-2 text-[13px] font-bold text-navy underline" disabled={busy} onClick={() => unlink(e.id)}>
                    {t.plUnlink}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {others.length > 0 && (
            <div className="grid gap-3 border-t border-subtle pt-3">
              <label className="grid gap-1.5 text-[13px] font-bold text-navy" htmlFor="pl-pick">
                {t.plAdd}
                <select id="pl-pick" className={inputClass} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t.plChoose}</option>
                  {others.map((e) => (
                    <option key={e.id} value={e.id}>
                      {nameOf(e)}
                      {e.status === 'draft' ? ` (${t.draft.toLowerCase()})` : ''}
                      {e.link ? ` — ${fill(t.plReplaces, { slug: e.link.pageSlug })}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {chosen && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[13px] font-bold text-navy" htmlFor="pl-laf">
                    {t.evLinkLabel} · AF
                    <TextInput id="pl-laf" value={labelAf} maxLength={40} onChange={(e) => setLabelAf(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-[13px] font-bold text-navy" htmlFor="pl-len">
                    {t.evLinkLabel} · EN
                    <TextInput id="pl-len" value={labelEn} maxLength={40} onChange={(e) => setLabelEn(e.target.value)} />
                  </label>
                </div>
              )}
              {blocked && <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13px] text-slate">{t.plPublishFirst}</p>}
              <div>
                <button type="button" className={buttonSecondary} disabled={!chosen || blocked || busy} onClick={link}>
                  {t.plLink}
                </button>
              </div>
            </div>
          )}
          <p aria-live="polite" className="text-[12.5px] text-slate-muted">
            {note}
          </p>
        </>
      )}
    </fieldset>
  );
}
