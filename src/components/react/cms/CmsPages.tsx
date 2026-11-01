import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill } from '../../../data/cmsCopy';
import { BLOCK_TYPES, type Block, type BlockType, type L10n, type Page } from '../../../lib/cms/types';
import { isValidSlug } from '../../../lib/cms/validate';
import { PageEventLinks } from './PageEventLinks';
import {
  Alert,
  ArrowDown,
  ArrowUp,
  buttonAdd,
  buttonPrimary,
  buttonSecondary,
  cardClass,
  cmsApi,
  Cross,
  formatWhen,
  IconButton,
  inputClass,
  labelClass,
  StatusBadge,
} from './ui';

type Summary = { slug: string; title: L10n; status: 'draft' | 'live'; updatedBy: string; updatedAt: string };
type Content = Omit<Page, 'status' | 'updatedBy' | 'updatedAt'>;
type Loaded = { rev: number; page: Page; live: Page | null; dirty: boolean };

export const PREVIEW_STORAGE_PREFIX = 'cms-preview:';

const L = (af = '', en = ''): L10n => ({ af, en });

/** A fresh block of each type: placeholders, not invented content. */
function newBlock(type: BlockType): Block {
  switch (type) {
    case 'infoCard':
      return { type, label: L(), big: L(), where: L(), note: L() };
    case 'cardGrid':
      return { type, heading: L(), intro: L(), cards: [{ label: L(), title: L(), text: L() }] };
    case 'timeSlots':
      return { type, day: L(), title: L(), slots: [] };
    case 'text':
      return { type, heading: L(), body: L() };
    case 'faq':
      return { type, items: [{ q: L(), a: L() }] };
    case 'image':
      return { type, src: '', alt: L(), caption: L() };
    case 'contactForm':
      return { type, topic: 'connect' };
    case 'callout':
      return { type, heading: L('Nog ’n vraag?', 'Any questions?'), text: L(), button: { label: L('Kontak ons', 'Contact us'), href: '/connect/' } };
  }
}

/** The Pages tab's starting point: canvas default, a text block and a callout. */
function newPage(): Content {
  return { slug: '', title: L(), eyebrow: L(), intro: L(), blocks: [newBlock('text'), newBlock('callout')] };
}

function contentOf(page: Page): Content {
  const { status: _s, updatedBy: _b, updatedAt: _a, ...rest } = page;
  return rest;
}

/** First filled-in Afrikaans text of a block, for its collapsed row. */
function summaryOf(block: Block): string {
  const texts: string[] = [];
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') {
      if ('af' in (v as object) && typeof (v as L10n).af === 'string') texts.push((v as L10n).af);
      else Object.values(v as object).forEach(walk);
    }
  };
  walk(block);
  if (block.type === 'image' && block.src) texts.unshift(block.src.split('/').pop() ?? '');
  if (block.type === 'timeSlots') texts.push(block.slots.join(', '));
  return texts.find((s) => s.trim()) ?? '';
}

function Pair({
  id,
  label,
  value,
  onChange,
  multiline,
  invalid,
}: {
  id: string;
  label: string;
  value: L10n;
  onChange: (v: L10n) => void;
  multiline?: boolean;
  invalid?: (lang: 'af' | 'en') => boolean;
}) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  const input = (l: 'af' | 'en') => {
    const props = {
      id: `${id}-${l}`,
      value: value[l],
      className: multiline ? `${inputClass} min-h-[96px] py-2.5` : inputClass,
      'aria-invalid': invalid?.(l) || undefined,
      onChange: (e: { target: { value: string } }) => onChange({ ...value, [l]: e.target.value }),
    };
    return multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />;
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['af', 'en'] as const).map((l) => (
        <div key={l} className="min-w-0">
          <label className={labelClass} htmlFor={`${id}-${l}`}>
            {label} · {l === 'af' ? t.afrikaans : t.english}
          </label>
          {input(l)}
        </div>
      ))}
    </div>
  );
}

function ListEditor<T>({
  items,
  onChange,
  make,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, set: (v: T) => void, i: number) => ReactNode;
}) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  return (
    <div className="grid gap-3">
      {items.map((item, i) => (
        <div key={i} className="grid min-w-0 gap-3 rounded-xl border border-subtle bg-cream p-3">
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}
          {items.length > 1 && (
            <button type="button" className="min-h-11 justify-self-start text-[13px] font-bold text-[#9a4f0f] underline" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              {t.pgRemoveItem}
            </button>
          )}
        </div>
      ))}
      {items.length < 12 && (
        <button type="button" className="min-h-11 justify-self-start text-[13.5px] font-bold text-navy underline" onClick={() => onChange([...items, make()])}>
          {t.pgAddItem}
        </button>
      )}
    </div>
  );
}

function BlockFields({ block, id, onChange, bad }: { block: Block; id: string; onChange: (b: Block) => void; bad: (path: string) => boolean }) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  const f = t.fields;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const pair = (key: string, label: string, multiline = false) => (
    <Pair
      id={`${id}-${key}`}
      label={label}
      value={(block as unknown as Record<string, L10n>)[key]}
      multiline={multiline}
      invalid={(l) => bad(`${key}.${l}`)}
      onChange={(v) => onChange({ ...block, [key]: v } as Block)}
    />
  );

  switch (block.type) {
    case 'infoCard':
      return (
        <>
          {pair('label', f.label)}
          {pair('big', f.big)}
          {pair('where', f.where)}
          {pair('note', f.note)}
        </>
      );
    case 'cardGrid':
      return (
        <>
          {pair('heading', f.heading)}
          {pair('intro', f.intro, true)}
          <span className={labelClass}>{f.cards}</span>
          <ListEditor
            items={block.cards}
            make={() => ({ label: L(), title: L(), text: L() })}
            onChange={(cards) => onChange({ ...block, cards })}
            render={(card, set, i) => (
              <>
                <Pair id={`${id}-c${i}-label`} label={f.label} value={card.label} onChange={(v) => set({ ...card, label: v })} />
                <Pair id={`${id}-c${i}-title`} label={f.title} value={card.title} onChange={(v) => set({ ...card, title: v })} invalid={(l) => bad(`cards.${i}.title.${l}`)} />
                <Pair id={`${id}-c${i}-text`} label={f.text} value={card.text} multiline onChange={(v) => set({ ...card, text: v })} />
              </>
            )}
          />
        </>
      );
    case 'timeSlots':
      return (
        <>
          {pair('day', f.day)}
          {pair('title', f.title)}
          <div>
            <label className={labelClass} htmlFor={`${id}-slots`}>
              {f.slots}
            </label>
            <textarea
              id={`${id}-slots`}
              rows={4}
              className={`${inputClass} min-h-[96px] py-2.5 font-mono text-[14px]`}
              aria-invalid={bad('slots') || undefined}
              value={block.slots.join('\n')}
              onChange={(e) => onChange({ ...block, slots: e.target.value.split('\n').map((s) => s.replace(/\s*[-–]\s*/, ' – ')).filter((s, i, a) => s.trim() || i < a.length - 1) })}
            />
          </div>
        </>
      );
    case 'text':
      return (
        <>
          {pair('heading', f.heading)}
          {pair('body', f.body, true)}
        </>
      );
    case 'faq':
      return (
        <ListEditor
          items={block.items}
          make={() => ({ q: L(), a: L() })}
          onChange={(items) => onChange({ ...block, items })}
          render={(item, set, i) => (
            <>
              <Pair id={`${id}-q${i}`} label={f.q} value={item.q} onChange={(v) => set({ ...item, q: v })} invalid={(l) => bad(`items.${i}.q.${l}`)} />
              <Pair id={`${id}-a${i}`} label={f.a} value={item.a} multiline onChange={(v) => set({ ...item, a: v })} invalid={(l) => bad(`items.${i}.a.${l}`)} />
            </>
          )}
        />
      );
    case 'image':
      return (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {block.src && <img src={block.src} alt="" className="h-20 w-auto rounded-lg" />}
            <label className={`${buttonSecondary} cursor-pointer`}>
              {uploading ? t.hdUploading : t.pgUpload}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) return setUploadError(t.hdErrSize);
                  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return setUploadError(t.hdErrType);
                  setUploading(true);
                  setUploadError('');
                  try {
                    const res = await fetch('/api/cms/media?kind=page&focus=0.5', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
                    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; src?: string };
                    if (res.ok && data.ok && data.src) onChange({ ...block, src: data.src });
                    else setUploadError(t.hdErrTransform);
                  } catch {
                    setUploadError(t.hdErrTransform);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>
          {(uploadError || bad('src')) && <Alert>{uploadError || t.errInvalid}</Alert>}
          {pair('alt', f.alt)}
          {pair('caption', f.caption)}
        </>
      );
    case 'contactForm':
      return (
        <div>
          <label className={labelClass} htmlFor={`${id}-topic`}>
            {f.topic}
          </label>
          <select id={`${id}-topic`} className={inputClass} value={block.topic} onChange={(e) => onChange({ ...block, topic: e.target.value as 'connect' | 'bible-study' })}>
            <option value="connect">{f.topicConnect}</option>
            <option value="bible-study">{f.topicStudy}</option>
          </select>
        </div>
      );
    case 'callout':
      return (
        <>
          {pair('heading', f.heading)}
          {pair('text', f.text, true)}
          <Pair
            id={`${id}-btn`}
            label={f.buttonLabel}
            value={block.button?.label ?? L()}
            onChange={(v) => onChange({ ...block, button: { label: v, href: block.button?.href ?? '/connect/' } })}
          />
          <div>
            <label className={labelClass} htmlFor={`${id}-href`}>
              {f.buttonHref} <span className="font-normal text-slate-muted">{t.optional}</span>
            </label>
            <input
              id={`${id}-href`}
              type="text"
              className={inputClass}
              placeholder="/connect/"
              aria-invalid={bad('button.href') || undefined}
              value={block.button?.href ?? ''}
              onChange={(e) =>
                onChange(
                  e.target.value || block.button?.label.af
                    ? { ...block, button: { label: block.button?.label ?? L(), href: e.target.value } }
                    : { type: 'callout', heading: block.heading, text: block.text },
                )
              }
            />
          </div>
        </>
      );
  }
}

/** Pages editor — CMS-Pages artboard. Every page uses the standard template. */
export function CmsPages({ initialSlug }: { initialSlug?: string | null }) {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];

  const [list, setList] = useState<Summary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-configured'>('loading');
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [open, setOpen] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  // Live This week cards that link here; the page cannot be unpublished under them.
  const [liveLinks, setLiveLinks] = useState(0);

  async function openPage(s: string) {
    const res = await cmsApi<Loaded>('GET', `/api/cms/pages?slug=${encodeURIComponent(s)}`);
    if (!res.ok) return setError(t.errLoad);
    setSlug(s);
    setLoaded(res.data);
    setContent(contentOf(res.data.page));
    setOpen(0);
    setDirty(false);
    setError('');
    setFieldErrors(new Set());
    // The status line already says Live or Draft.
    setNote('');
  }

  useEffect(() => {
    (async () => {
      const res = await cmsApi<{ items: Summary[] }>('GET', '/api/cms/pages');
      if (!res.ok) {
        setLoadState(res.status === 503 ? 'not-configured' : 'error');
        return;
      }
      setList(res.data.items);
      setLoadState('ready');
      const first = (initialSlug && res.data.items.find((p) => p.slug === initialSlug)) || res.data.items[0];
      if (first) await openPage(first.slug);
    })();
    // Loads once; switching language must not drop edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(fn: (c: Content) => Content) {
    setContent((c) => (c ? fn(c) : c));
    setDirty(true);
    setNote(t.unsaved);
  }

  function startNew() {
    setSlug(null);
    setLoaded(null);
    setContent(newPage());
    setOpen(0);
    setDirty(true);
    setError('');
    setFieldErrors(new Set());
    setNote(t.notSaved);
  }

  async function save(publish: boolean) {
    if (!content) return;
    setBusy(true);
    setError('');
    setFieldErrors(new Set());
    // Blank slot lines are typing room, not slots.
    const page: Content = {
      ...content,
      blocks: content.blocks.map((b) => (b.type === 'timeSlots' ? { ...b, slots: b.slots.map((s) => s.trim()).filter(Boolean) } : b)),
    };
    const res = await cmsApi<Loaded>('PUT', '/api/cms/pages', { rev: loaded?.rev ?? 0, page, publish });
    setBusy(false);
    if (res.ok) {
      setLoaded(res.data);
      setContent(contentOf(res.data.page));
      setSlug(res.data.page.slug);
      setDirty(false);
      setNote(publish ? t.publishedNow : t.draftSaved);
      const summary: Summary = {
        slug: res.data.page.slug,
        title: res.data.page.title,
        status: res.data.live ? 'live' : 'draft',
        updatedBy: res.data.page.updatedBy,
        updatedAt: res.data.page.updatedAt,
      };
      setList((l) => (l.some((p) => p.slug === summary.slug) ? l.map((p) => (p.slug === summary.slug ? summary : p)) : [...l, summary]));
      return;
    }
    if (res.errors.includes('slug-taken')) setError(t.pgErrSlugTaken);
    else if (res.status === 409) setError(t.errConflict);
    else if (res.status === 400) {
      setError(t.errInvalid);
      setFieldErrors(new Set(res.errors));
    } else setError(t.errSave);
  }

  async function unpublish() {
    if (!slug) return;
    setBusy(true);
    const res = await cmsApi<Loaded>('PUT', '/api/cms/pages', { action: 'unpublish', slug });
    setBusy(false);
    if (!res.ok) return setError(res.errors.includes('linked') ? t.pgErrLinked : t.errSave);
    setLoaded(res.data);
    setList((l) => l.map((p) => (p.slug === slug ? { ...p, status: 'draft' } : p)));
    setNote(t.draftSaved);
  }

  function preview() {
    if (!content) return;
    const key = content.slug || 'new';
    try {
      window.localStorage.setItem(`${PREVIEW_STORAGE_PREFIX}${key}`, JSON.stringify(content));
    } catch {
      // Storage blocked: the preview falls back to the saved draft.
    }
    window.open(`/members/preview/?slug=${encodeURIComponent(key)}`, '_blank', 'noopener');
  }

  if (loadState === 'loading') return <div aria-hidden="true" className="h-64 rounded-card border border-subtle bg-cream-card" />;
  if (loadState !== 'ready') return <Alert>{loadState === 'not-configured' ? t.errNotConfigured : t.errLoad}</Alert>;

  const isLive = Boolean(loaded?.live);
  const statusLine = !loaded ? t.pgStatusDraft : isLive ? (loaded.dirty || dirty ? t.pgStatusLiveDirty : t.pgStatusLive) : t.pgStatusDraft;
  const bad = (path: string) => fieldErrors.has(path);
  const blockBad = (i: number) => (path: string) => fieldErrors.has(`blocks.${i}.${path}`);

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
      <section aria-labelledby="pl-h" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="pl-h" className="font-serif text-[26px] font-medium">
            {t.pgHeading}
          </h2>
          <button type="button" onClick={startNew} className={buttonAdd}>
            {t.pgNew}
          </button>
        </div>
        <p className="mb-4 text-[14px] text-slate-muted">{t.pgHelp}</p>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {list.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => openPage(p.slug)}
                aria-current={p.slug === slug ? 'true' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl border bg-cream-card px-3.5 py-3 text-left ${
                  p.slug === slug ? 'border-navy shadow-[inset_3px_0_0_var(--color-navy)]' : 'border-subtle hover:border-ink/30'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{p.title.af || t.pgNewTitle}</span>
                  <span className="block truncate font-mono text-[12.5px] text-slate-muted">/{p.slug}/</span>
                </span>
                <StatusBadge live={p.status === 'live'} liveLabel={t.live} draftLabel={t.draft} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {content && (
        <section aria-labelledby="pg-h" className={cardClass}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h2 id="pg-h" className="min-w-0 break-words font-serif text-[24px] font-medium">
              {content.title.af || t.pgNewTitle}
            </h2>
            <span className="flex flex-wrap gap-2">
              <button type="button" className={buttonSecondary} onClick={preview}>
                {t.pgPreview} ↗
              </button>
              <button type="button" className={buttonSecondary} disabled={busy} onClick={() => save(false)}>
                {busy ? t.saving : t.saveDraft}
              </button>
              <button type="button" className={buttonPrimary} disabled={busy} onClick={() => save(true)}>
                {isLive ? t.pgPublishChanges : t.pgPublishPage}
              </button>
            </span>
          </div>
          <p className="mb-5 text-[13px] text-slate-muted">
            {t.pgTemplate} <strong className="text-ink">{t.pgTemplateName}</strong> · {statusLine}
            <span aria-live="polite">{note ? ` · ${note}` : ''}</span>
            {loaded && loaded.page.updatedBy !== 'seed' && ` · ${fill(t.lastChange, { by: loaded.page.updatedBy, at: formatWhen(loaded.page.updatedAt, lang) })}`}
          </p>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          <fieldset className="mb-6 grid min-w-0 gap-4 rounded-xl border border-subtle p-4">
            <legend className="px-1 text-[12px] font-bold uppercase tracking-[.1em] text-slate-muted">{t.pgHeader}</legend>
            <Pair id="pg-title" label={t.pgTitle} value={content.title} onChange={(v) => edit((c) => ({ ...c, title: v }))} invalid={(l) => bad(`title.${l}`)} />
            <Pair id="pg-eyebrow" label={t.pgEyebrow} value={content.eyebrow} onChange={(v) => edit((c) => ({ ...c, eyebrow: v }))} />
            <div>
              <label className={labelClass} htmlFor="pg-slug">
                {t.pgSlug}
              </label>
              <div className="flex min-w-0 items-center gap-1">
                <span className="flex-none text-[14px] text-slate-muted">sdatygerberg.co.za/</span>
                <input
                  id="pg-slug"
                  type="text"
                  className={`${inputClass} font-mono`}
                  value={content.slug}
                  readOnly={Boolean(loaded)}
                  aria-invalid={bad('slug') || (content.slug !== '' && !isValidSlug(content.slug)) || undefined}
                  onChange={(e) => edit((c) => ({ ...c, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                />
                <span className="flex-none text-[14px] text-slate-muted">/</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-slate-muted">{t.pgSlugHelp}</p>
            </div>
            <Pair id="pg-intro" label={t.pgIntro} value={content.intro} multiline onChange={(v) => edit((c) => ({ ...c, intro: v }))} />
            <div>
              <label className="flex min-h-11 items-center gap-3 text-[14px] font-bold text-ink">
                <input
                  type="checkbox"
                  checked={Boolean(content.showInEvents)}
                  onChange={(e) => edit((c) => ({ ...c, showInEvents: e.target.checked }))}
                  className="h-5 w-5 accent-navy"
                />
                {t.pgShowInEvents}
              </label>
              <p className="text-[12.5px] text-slate-muted">{t.pgShowInEventsHelp}</p>
            </div>
          </fieldset>

          {loaded && slug ? <PageEventLinks slug={slug} pageLive={isLive} onLinkedChange={setLiveLinks} /> : null}

          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[.1em] text-slate-muted">{t.pgBlocks}</span>
            <span className="text-[12.5px] text-slate-muted">
              {content.blocks.length === 1 ? t.pgBlockCountOne : fill(t.pgBlockCount, { n: content.blocks.length })}
            </span>
          </div>
          <ol className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-2.5">
            {content.blocks.map((block, i) => {
              const hasError = [...fieldErrors].some((e) => e.startsWith(`blocks.${i}.`));
              return (
                <li key={i} className={`min-w-0 rounded-card border bg-white p-3 ${open === i || hasError ? 'border-navy' : 'border-ink/12'}`}>
                  <div className="flex items-center gap-2">
                    <span className="hidden flex-none rounded-md border border-dashed border-ink/30 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.1em] text-slate-muted min-[480px]:inline">
                      {t.blocks[block.type]}
                    </span>
                    <button
                      type="button"
                      aria-expanded={open === i}
                      onClick={() => setOpen(open === i ? -1 : i)}
                      className="min-h-11 min-w-0 flex-1 text-left text-[14px] text-ink"
                    >
                      {/* On a phone the type tag moves into the row, above the summary. */}
                      <span className="block text-[10.5px] font-bold uppercase tracking-[.1em] text-slate-muted min-[480px]:hidden">{t.blocks[block.type]}</span>
                      <span className="block truncate">{summaryOf(block) || <span className="text-slate-muted">{t.pgEmptyBlock}</span>}</span>
                    </button>
                    <IconButton label={t.pgBlockUp} disabled={i === 0} onClick={() => edit((c) => { const b = c.blocks.slice(); [b[i - 1], b[i]] = [b[i], b[i - 1]]; return { ...c, blocks: b }; })}>
                      <ArrowUp />
                    </IconButton>
                    <IconButton label={t.pgBlockDown} disabled={i === content.blocks.length - 1} onClick={() => edit((c) => { const b = c.blocks.slice(); [b[i + 1], b[i]] = [b[i], b[i + 1]]; return { ...c, blocks: b }; })}>
                      <ArrowDown />
                    </IconButton>
                    <IconButton label={t.pgBlockRemove} onClick={() => edit((c) => ({ ...c, blocks: c.blocks.filter((_, j) => j !== i) }))}>
                      <Cross />
                    </IconButton>
                  </div>
                  {(open === i || hasError) && (
                    <div className="mt-3 grid gap-4 border-t border-subtle pt-3">
                      <BlockFields
                        block={block}
                        id={`b${i}`}
                        bad={blockBad(i)}
                        onChange={(b) => edit((c) => ({ ...c, blocks: c.blocks.map((x, j) => (j === i ? b : x)) }))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div>
            <span className={labelClass}>{t.pgAddBlock}</span>
            <div className="flex flex-wrap gap-2">
              {BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-pill border border-dashed border-navy/50 px-4 text-[13px] font-bold text-navy hover:bg-navy/5"
                  onClick={() => {
                    edit((c) => ({ ...c, blocks: [...c.blocks, newBlock(type)] }));
                    setOpen(content.blocks.length);
                  }}
                >
                  + {t.blocks[type]}
                </button>
              ))}
            </div>
          </div>

          {isLive && (
            <div className="mt-6 border-t border-subtle pt-4">
              <button type="button" className="min-h-11 text-[13.5px] font-bold text-[#9a4f0f] underline disabled:opacity-50" disabled={busy || liveLinks > 0} onClick={unpublish}>
                {t.pgUnpublish}
              </button>
              {liveLinks > 0 && <p className="mt-1 text-[12.5px] text-slate-muted">{t.pgErrLinked}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
