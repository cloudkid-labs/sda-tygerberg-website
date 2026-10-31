import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill } from '../../../data/cmsCopy';
import { WEEKDAYS_AF, type ChurchEvent, type Page, type PublicEvent, type WeekdayAf } from '../../../lib/cms/types';
import { slugify } from '../../../lib/cms/seed';
import { STATIC_PAGE_SLUGS } from '../../../lib/cms/validate';
import { timeRange } from '../../../lib/cms/time';
import { eventLabel, WeekCard } from '../ThisWeek';
import {
  Alert,
  ArrowDown,
  ArrowUp,
  buttonAdd,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  cardClass,
  cmsApi,
  Field,
  formatWhen,
  IconButton,
  inputClass,
  labelClass,
  newId,
  StatusBadge,
  TextInput,
} from './ui';

type Item = ChurchEvent;
type Unstamped = Omit<Item, 'updatedBy' | 'updatedAt'>;
type PageSummary = { slug: string; title: { af: string; en: string }; status: 'draft' | 'live' };

const WEEKDAY_EN: Record<WeekdayAf, string> = {
  Sondag: 'Sunday',
  Maandag: 'Monday',
  Dinsdag: 'Tuesday',
  Woensdag: 'Wednesday',
  Donderdag: 'Thursday',
  Vrydag: 'Friday',
  Sabbat: 'Sabbath',
};

/** Static pages a card may link to, by slug — labels as the site names them. */
const STATIC_LABELS: Record<string, string> = {
  youth: 'Jeug · Youth',
  'blood-bank': 'Bloedbank · Blood Bank',
  connect: 'Verbind · Connect',
  'bible-studies': 'Bybelstudies · Bible Studies',
  giving: 'Skenk · Giving',
  beliefs: 'Wat Ons Glo · Beliefs',
  map: 'Kaart · Map',
};

type Draft = {
  id: string;
  kind: 'weekly' | 'once';
  day: WeekdayAf;
  date: string;
  start: string;
  end: string;
  nameAf: string;
  nameEn: string;
  whereAf: string;
  whereEn: string;
  /** '' none, 'new' = create a page from the template on save, else a slug. */
  link: string;
  labelAf: string;
  labelEn: string;
  status: 'draft' | 'live';
};

const BLANK: Omit<Draft, 'id'> = {
  kind: 'weekly',
  day: 'Dinsdag',
  date: '',
  start: '19:00',
  end: '20:00',
  nameAf: '',
  nameEn: '',
  whereAf: '',
  whereEn: '',
  link: '',
  labelAf: 'Sien meer',
  labelEn: 'See more',
  status: 'draft',
};

function toDraft(e: Item): Draft {
  return {
    id: e.id,
    kind: e.kind,
    day: e.day ?? 'Dinsdag',
    date: e.date ?? '',
    start: e.start,
    end: e.end,
    nameAf: e.name.af,
    nameEn: e.name.en,
    whereAf: e.where.af,
    whereEn: e.where.en,
    link: e.link?.pageSlug ?? '',
    labelAf: e.link?.label.af ?? 'Sien meer',
    labelEn: e.link?.label.en ?? 'See more',
    status: e.status,
  };
}

function fromDraft(d: Draft, linkSlug: string | null, status: 'draft' | 'live'): Unstamped {
  return {
    id: d.id,
    kind: d.kind,
    ...(d.kind === 'weekly' ? { day: d.day } : { date: d.date }),
    start: d.start,
    end: d.end,
    name: { af: d.nameAf.trim(), en: d.nameEn.trim() },
    where: { af: d.whereAf.trim(), en: d.whereEn.trim() },
    ...(linkSlug ? { link: { pageSlug: linkSlug, label: { af: d.labelAf.trim(), en: d.labelEn.trim() } } } : {}),
    order: 0,
    status,
  };
}

const strip = (items: Item[]): Unstamped[] => items.map(({ updatedBy: _b, updatedAt: _a, ...rest }) => rest);

/** A draft page from the standard template, pre-filled with this event. */
function pageFromEvent(d: Draft, slug: string): Omit<Page, 'status' | 'updatedBy' | 'updatedAt'> {
  const label =
    d.kind === 'weekly'
      ? { af: `Elke ${d.day}`, en: `Every ${WEEKDAY_EN[d.day]}` }
      : { af: eventLabel({ kind: 'once', date: d.date }, 'af'), en: eventLabel({ kind: 'once', date: d.date }, 'en') };
  return {
    slug,
    title: { af: d.nameAf.trim() || d.nameEn.trim(), en: d.nameEn.trim() || d.nameAf.trim() },
    eyebrow: { af: 'Hierdie week', en: 'This week' },
    intro: { af: '', en: '' },
    blocks: [
      {
        type: 'infoCard',
        label,
        big: { af: timeRange(d.start, d.end), en: timeRange(d.start, d.end) },
        where: { af: d.whereAf.trim(), en: d.whereEn.trim() },
        note: { af: '', en: '' },
      },
      {
        type: 'callout',
        heading: { af: 'Nog ’n vraag?', en: 'Any questions?' },
        text: { af: '', en: '' },
        button: { label: { af: 'Kontak ons', en: 'Contact us' }, href: '/connect/' },
      },
    ],
  };
}

/** "This week" editor — CMS-Events artboard. */
export function CmsEvents({ onOpenPage }: { onOpenPage?: (slug: string) => void }) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];

  const [items, setItems] = useState<Item[]>([]);
  const [rev, setRev] = useState(0);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-configured'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ev, pg] = await Promise.all([
      cmsApi<{ rev: number; items: Item[] }>('GET', '/api/cms/events'),
      cmsApi<{ items: PageSummary[] }>('GET', '/api/cms/pages'),
    ]);
    if (!ev.ok) {
      setLoadState(ev.status === 503 ? 'not-configured' : 'error');
      return;
    }
    setItems(ev.data.items);
    setRev(ev.data.rev);
    if (pg.ok) setPages(pg.data.items);
    setLoadState('ready');
    const first = ev.data.items[0];
    if (first) {
      setSelected(first.id);
      setDraft(toDraft(first));
      setNote(first.status === 'live' ? t.published : t.draft);
    }
  }, [t]);

  useEffect(() => {
    void load();
    // Loads once; the language switch must not refetch and drop edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIndex = items.findIndex((e) => e.id === selected);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  function select(item: Item) {
    setSelected(item.id);
    setDraft(toDraft(item));
    setIsNew(false);
    setConfirming(false);
    setError('');
    setFieldErrors(new Set());
    setNote(item.status === 'live' ? t.published : t.draft);
  }

  function addNew() {
    setSelected(null);
    setDraft({ id: newId('geleentheid'), ...BLANK });
    setIsNew(true);
    setConfirming(false);
    setError('');
    setFieldErrors(new Set());
    setNote(t.notSaved);
  }

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setNote(t.unsaved);
  }

  /** PUTs the whole list. Returns the saved list, or null with the error shown. */
  async function save(next: Unstamped[], focusIndex: number | null): Promise<Item[] | null> {
    setBusy(true);
    setError('');
    setFieldErrors(new Set());
    const res = await cmsApi<{ rev: number; items: Item[] }>('PUT', '/api/cms/events', { rev, items: next });
    setBusy(false);
    if (res.ok) {
      setItems(res.data.items);
      setRev(res.data.rev);
      return res.data.items;
    }
    if (res.status === 409) setError(t.errConflict);
    else if (res.status === 400) {
      setError(t.errInvalid);
      if (focusIndex !== null) {
        const prefix = `items.${focusIndex}.`;
        setFieldErrors(new Set(res.errors.filter((e) => e.startsWith(prefix)).map((e) => e.slice(prefix.length))));
      }
    } else setError(t.errSave);
    return null;
  }

  async function createLinkedPage(d: Draft): Promise<string | null> {
    const base = slugify(d.nameEn || d.nameAf) || 'bladsy';
    for (let n = 1; n <= 5; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const res = await cmsApi<{ page: Page }>('PUT', '/api/cms/pages', { rev: 0, page: pageFromEvent(d, slug) });
      if (res.ok) {
        setPages((p) => [...p, { slug, title: res.data.page.title, status: 'draft' }]);
        return slug;
      }
      // Taken, or a reserved address: try the next form.
      if (res.status !== 409 && !(res.status === 400 && res.errors.includes('slug'))) break;
    }
    setError(t.errSave);
    return null;
  }

  async function commit(status: 'draft' | 'live') {
    if (!draft) return;
    let linkSlug: string | null = draft.link && draft.link !== 'new' ? draft.link : null;
    let finalStatus = status;
    let openPage: string | null = null;
    if (draft.link === 'new') {
      setBusy(true);
      linkSlug = await createLinkedPage(draft);
      setBusy(false);
      if (!linkSlug) return;
      openPage = linkSlug;
      // A card cannot go live pointing at a draft page; it waits as a draft.
      finalStatus = 'draft';
    }
    const item = fromDraft(draft, linkSlug, finalStatus);
    const list = strip(items);
    const index = isNew ? list.length : selectedIndex;
    if (isNew) list.push(item);
    else list[index] = item;
    const saved = await save(list, index);
    if (!saved) return;
    const savedItem = saved.find((e) => e.id === item.id);
    if (savedItem) {
      setSelected(savedItem.id);
      setDraft(toDraft(savedItem));
      setIsNew(false);
    }
    setNote(finalStatus === 'live' ? t.publishedNow : t.draftSaved);
    if (openPage) onOpenPage?.(openPage);
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const list = strip(items);
    [list[index], list[j]] = [list[j], list[index]];
    await save(list, null);
  }

  async function remove() {
    if (selectedIndex < 0) return;
    const list = strip(items).filter((_, i) => i !== selectedIndex);
    const saved = await save(list, null);
    setConfirming(false);
    if (!saved) return;
    const next = saved[Math.min(selectedIndex, saved.length - 1)];
    if (next) select(next);
    else {
      setSelected(null);
      setDraft(null);
    }
    setNote(t.removed);
  }

  const linkOptions = useMemo(() => {
    const cms = pages.map((p) => ({
      value: p.slug,
      label: `${p.title.af} · ${p.title.en}${p.status === 'draft' ? ` (${t.draft.toLowerCase()})` : ''}`,
      draft: p.status === 'draft',
    }));
    const statics = [...STATIC_PAGE_SLUGS].map((slug) => ({ value: slug, label: STATIC_LABELS[slug] ?? slug, draft: false }));
    return [...statics, ...cms];
  }, [pages, t]);
  const linkedDraftPage = draft ? linkOptions.find((o) => o.value === draft.link)?.draft === true : false;

  if (loadState === 'loading') return <div aria-hidden="true" className="h-64 rounded-card border border-subtle bg-cream-card" />;
  if (loadState !== 'ready') return <Alert>{loadState === 'not-configured' ? t.errNotConfigured : t.errLoad}</Alert>;

  const bad = (field: string) => fieldErrors.has(field);
  const preview: PublicEvent | null = draft
    ? {
        ...fromDraft(draft, draft.link && draft.link !== 'new' ? draft.link : draft.link === 'new' ? 'nuwe-bladsy' : null, draft.status),
        name: { af: draft.nameAf || 'Naam', en: draft.nameEn || 'Name' },
      }
    : null;

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section aria-labelledby="ev-h" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="ev-h" className="font-serif text-[26px] font-medium">
            {t.evHeading}
          </h2>
          <button type="button" onClick={addNew} className={buttonAdd}>
            {t.evAdd}
          </button>
        </div>
        <p className="mb-4 text-[14px] text-slate-muted">{t.evHelp}</p>
        <ol className="grid gap-2.5">
          {items.map((e, i) => (
            <li
              key={e.id}
              className={`flex items-center gap-3 rounded-card border bg-cream-card p-3 sm:px-4 ${
                e.id === selected ? 'border-navy shadow-[inset_3px_0_0_var(--color-navy)]' : 'border-subtle hover:border-ink/30'
              }`}
            >
              <button
                type="button"
                onClick={() => select(e)}
                aria-label={fill(t.evEditAria, { name: e.name[lang] || t.evNewName })}
                aria-current={e.id === selected ? 'true' : undefined}
                className="min-h-11 min-w-0 flex-1 text-left"
              >
                <span className="block text-[11px] font-bold uppercase tracking-[.08em] text-orange">{eventLabel(e, lang)}</span>
                <span className="block truncate font-serif text-[17px] text-ink">
                  {e.name.af || t.evNewName} <span className="text-slate-muted">· {e.name.en}</span>
                </span>
                <span className="block text-[12.5px] font-bold text-slate">
                  {timeRange(e.start, e.end)}
                  {e.link ? ` · ${t.evLinksToPage}` : ''}
                </span>
              </button>
              <StatusBadge live={e.status === 'live'} liveLabel={t.live} draftLabel={t.draft} />
              <span className="flex flex-none flex-col gap-1 sm:flex-row">
                <IconButton label={fill(t.moveUp, { name: e.name[lang] })} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </IconButton>
                <IconButton label={fill(t.moveDown, { name: e.name[lang] })} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[13px] text-slate-muted">{t.evBloodNote}</p>
      </section>

      {draft && (
        <section aria-labelledby="ed-h" className={cardClass}>
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ed-h" className="font-serif text-[24px] font-medium">
              {isNew ? t.evNew : t.evEdit}
            </h2>
            <span className="text-[12px] text-slate-muted" aria-live="polite">
              {note}
            </span>
          </div>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          <div className="grid gap-5">
            <div>
              <span className={labelClass} id="ev-type">
                {t.evType}
              </span>
              <div role="group" aria-labelledby="ev-type" className="inline-flex overflow-hidden rounded-pill border border-strong">
                {(['weekly', 'once'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={draft.kind === kind}
                    onClick={() => edit('kind', kind)}
                    className={`min-h-11 px-4 text-[13px] font-bold ${draft.kind === kind ? 'bg-navy text-white' : 'text-navy'}`}
                  >
                    {kind === 'weekly' ? t.evWeekly : t.evOnce}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {draft.kind === 'weekly' ? (
                <Field id="ev-day" label={t.evDay}>
                  <select id="ev-day" className={inputClass} value={draft.day} onChange={(e) => edit('day', e.target.value as WeekdayAf)} aria-invalid={bad('day') || undefined}>
                    {WEEKDAYS_AF.map((d) => (
                      <option key={d} value={d}>
                        {lang === 'af' ? `${d} · ${WEEKDAY_EN[d]}` : `${WEEKDAY_EN[d]} · ${d}`}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field id="ev-date" label={t.evDate}>
                  <input id="ev-date" type="date" className={inputClass} value={draft.date} onChange={(e) => edit('date', e.target.value)} aria-invalid={bad('date') || undefined} />
                </Field>
              )}
              <Field id="ev-start" label={t.evStart}>
                <input id="ev-start" type="time" className={inputClass} value={draft.start} onChange={(e) => edit('start', e.target.value)} aria-invalid={bad('start') || undefined} />
              </Field>
              <Field id="ev-end" label={t.evEnd}>
                <input id="ev-end" type="time" className={inputClass} value={draft.end} onChange={(e) => edit('end', e.target.value)} aria-invalid={bad('end') || undefined} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ev-naf" label={`${t.evName} · ${t.afrikaans}`}>
                <TextInput id="ev-naf" value={draft.nameAf} maxLength={80} placeholder="bv. Biduur" onChange={(e) => edit('nameAf', e.target.value)} invalid={bad('name.af')} />
              </Field>
              <Field id="ev-nen" label={`${t.evName} · ${t.english}`}>
                <TextInput id="ev-nen" value={draft.nameEn} maxLength={80} placeholder="e.g. Prayer Meeting" onChange={(e) => edit('nameEn', e.target.value)} invalid={bad('name.en')} />
              </Field>
              <Field id="ev-waf" label={`${t.evWhere} · ${t.afrikaans}`}>
                <TextInput id="ev-waf" value={draft.whereAf} maxLength={160} placeholder="By die kerk" onChange={(e) => edit('whereAf', e.target.value)} invalid={bad('where.af')} />
              </Field>
              <Field id="ev-wen" label={`${t.evWhere} · ${t.english}`}>
                <TextInput id="ev-wen" value={draft.whereEn} maxLength={160} placeholder="At the church" onChange={(e) => edit('whereEn', e.target.value)} invalid={bad('where.en')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Field id="ev-link" label={<>{t.evLink} <span className="font-normal text-slate-muted">{t.optional}</span></>}>
                <select id="ev-link" className={inputClass} value={draft.link} onChange={(e) => edit('link', e.target.value)} aria-invalid={bad('link.pageSlug') || undefined}>
                  <option value="">{t.evNoLink}</option>
                  {linkOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  <option value="new">{t.evNewPage}</option>
                </select>
              </Field>
              {draft.link && (
                <>
                  <Field id="ev-laf" label={`${t.evLinkLabel} · AF`}>
                    <TextInput id="ev-laf" value={draft.labelAf} maxLength={40} onChange={(e) => edit('labelAf', e.target.value)} invalid={bad('link.label.af')} />
                  </Field>
                  <Field id="ev-len" label={`${t.evLinkLabel} · EN`}>
                    <TextInput id="ev-len" value={draft.labelEn} maxLength={40} onChange={(e) => edit('labelEn', e.target.value)} invalid={bad('link.label.en')} />
                  </Field>
                </>
              )}
            </div>
            {draft.link === 'new' && <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13px] text-slate">{t.evNewPageNote}</p>}
            {linkedDraftPage && <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13px] text-slate">{t.evDraftPageNote}</p>}

            {preview && (
              <div>
                <span className={labelClass}>{t.evPreview}</span>
                <div className="max-w-[300px]" inert>
                  <div className="grid">
                    <WeekCard event={preview} lang="af" />
                  </div>
                </div>
              </div>
            )}

            {selectedItem && !isNew && (
              <p className="text-[12.5px] text-slate-muted">
                {fill(t.lastChange, { by: selectedItem.updatedBy, at: formatWhen(selectedItem.updatedAt, lang) })}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-5">
              {!isNew &&
                (confirming ? (
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                    {t.evConfirmDelete}
                    <button type="button" className={buttonDanger} onClick={remove} disabled={busy}>
                      {t.evYesDelete}
                    </button>
                    <button type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>
                      {t.cancel}
                    </button>
                  </span>
                ) : (
                  <button type="button" className={buttonDanger} onClick={() => setConfirming(true)}>
                    {t.evDelete}
                  </button>
                ))}
              <span className="ml-auto flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} disabled={busy} onClick={() => commit('draft')}>
                  {busy ? t.saving : t.saveDraft}
                </button>
                <button type="button" className={buttonPrimary} disabled={busy || linkedDraftPage} onClick={() => commit('live')}>
                  {t.publish}
                </button>
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
