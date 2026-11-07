import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { cmsCopy, fill } from '../../../data/cmsCopy';
import type { DepartmentHead, PublicHead } from '../../../lib/cms/types';
import { cdnImageUrl, headshotFallbackFor } from '../../../lib/cdnImage';
import { Card } from '../AboutCarousel';
import { cropGeometry, MAX_ZOOM, panAfterDrag } from '../../../lib/cms/crop';
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
  Cross,
  Field,
  formatWhen,
  IconButton,
  labelClass,
  newId,
  TextInput,
} from './ui';

type Head = DepartmentHead;
type Unstamped = Omit<Head, 'updatedBy' | 'updatedAt'>;

const MAX_BYTES = 5 * 1024 * 1024;
/** Faces sit high in most portraits, so the frame starts a little above centre. */
const DEFAULT_PAN = { x: 0.5, y: 0.3 };
/** What the canvas writes: the stored headshot size (MEDIA_SIZES.head). */
const OUT_W = 1280;
const OUT_H = 1600;

/** A small thumbnail: the edge transformer when it answers, the plain file when not. */
function Thumb({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? headshotFallbackFor(src) : cdnImageUrl(src, 320)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/** Department heads editor — CMS-Leaders artboard. Edits stay local until Publish. */
export function CmsHeads() {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];

  const [items, setItems] = useState<Unstamped[]>([]);
  const [saved, setSaved] = useState<Head[]>([]);
  const [rev, setRev] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not-configured'>('loading');
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await cmsApi<{ rev: number; items: Head[] }>('GET', '/api/cms/heads');
      if (!res.ok) {
        setLoadState(res.status === 503 ? 'not-configured' : 'error');
        return;
      }
      setSaved(res.data.items);
      setItems(res.data.items.map(({ updatedBy: _b, updatedAt: _a, ...rest }) => rest));
      setRev(res.data.rev);
      setNote(t.published);
      setLoadState('ready');
    })();
    // Loads once; switching language must not drop edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unpublished edits are local; leaving the page would lose them.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The preview is a data: URL, not URL.createObjectURL(): the site CSP's
  // img-src allows data: but not blob:, and widening it for one preview is
  // not worth it. A later pick or a head switch supersedes a read in flight.
  const readSeq = useRef(0);

  const current = items[sel];

  function patch(fn: (h: Unstamped) => Unstamped) {
    setItems((list) => list.map((h, i) => (i === sel ? fn({ ...h, positions: h.positions.map((p) => ({ ...p })) }) : h)));
    setDirty(true);
    setNote(t.unsaved);
  }

  function select(i: number) {
    setSel(i);
    setConfirming(false);
    readSeq.current += 1;
    setPending(null);
    setUploadError('');
    setFieldErrors(new Set());
  }

  function move(dir: -1 | 1) {
    const j = sel + dir;
    if (j < 0 || j >= items.length) return;
    setItems((list) => {
      const a = list.slice();
      [a[sel], a[j]] = [a[j], a[sel]];
      return a;
    });
    setSel(j);
    setDirty(true);
    setNote(t.unsaved);
  }

  function addNew() {
    const head: Unstamped = { id: newId('persoon'), name: '', positions: [{ af: '', en: '' }], visible: true, order: items.length };
    setItems((list) => [...list, head]);
    select(items.length);
    setDirty(true);
    setNote(t.notSaved);
  }

  function removeCurrent() {
    setItems((list) => list.filter((_, i) => i !== sel));
    setSel((s) => Math.max(0, Math.min(s, items.length - 2)));
    setConfirming(false);
    setDirty(true);
    setNote(t.removed);
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setUploadError('');
    if (!file) return;
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') return setUploadError(t.hdErrType);
    if (file.size > MAX_BYTES) return setUploadError(t.hdErrSize);
    const seq = ++readSeq.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (seq !== readSeq.current || typeof reader.result !== 'string') return;
      setZoom(1);
      setPan(DEFAULT_PAN);
      setNatural(null);
      setPending({ file, url: reader.result });
    };
    reader.onerror = () => {
      if (seq === readSeq.current) setUploadError(t.hdErrType);
    };
    reader.readAsDataURL(file);
  }

  const geometry = natural ? cropGeometry({ naturalWidth: natural.w, naturalHeight: natural.h, zoom, panX: pan.x, panY: pan.y }) : null;

  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    if (!pending || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !geometry || !frameRef.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setPan((p) => panAfterDrag(geometry, p, dx, dy, frameRef.current!.getBoundingClientRect().width));
  }
  function onDragEnd() {
    drag.current = null;
  }

  /**
   * The crop happens here, on a canvas: exactly the frame the editor sees, at
   * the stored size. The browser has already applied any EXIF rotation to the
   * <img>, so a phone photo lands the right way up, and the canvas carries no
   * metadata. The server still sniffs, strips and transcodes it.
   */
  async function croppedJpeg(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!img || !geometry) return null;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff'; // a transparent PNG gets white, not black
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, geometry.sx, geometry.sy, geometry.sw, geometry.sh, 0, 0, OUT_W, OUT_H);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }

  async function upload() {
    if (!pending || !current) return;
    setBusy(true);
    setUploadError('');
    try {
      const jpeg = await croppedJpeg();
      if (!jpeg) {
        setUploadError(t.hdErrTransform);
        return;
      }
      const res = await fetch(`/api/cms/media?kind=head&id=${encodeURIComponent(current.id)}&focus=0.5`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: jpeg,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; src?: string; errors?: string[] };
      if (!res.ok || !data.ok || !data.src) {
        setUploadError(res.status === 413 ? t.hdErrSize : res.status === 415 ? t.hdErrType : t.hdErrTransform);
        return;
      }
      const src = data.src;
      patch((h) => ({ ...h, photo: { src, alt: h.name } }));
      setPending(null);
    } catch {
      setUploadError(t.hdErrTransform);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError('');
    setFieldErrors(new Set());
    // A headshot's alt text is the person's name, so it follows a rename.
    const list = items.map((h) => (h.photo ? { ...h, photo: { ...h.photo, alt: h.name.trim() } } : h));
    const res = await cmsApi<{ rev: number; items: Head[] }>('PUT', '/api/cms/heads', { rev, items: list });
    setBusy(false);
    if (res.ok) {
      setSaved(res.data.items);
      setItems(res.data.items.map(({ updatedBy: _b, updatedAt: _a, ...rest }) => rest));
      setRev(res.data.rev);
      setDirty(false);
      setNote(t.publishedNow);
      return;
    }
    if (res.status === 409) setError(t.errConflict);
    else if (res.status === 400) {
      setError(t.errInvalid);
      const prefix = `items.${sel}.`;
      setFieldErrors(new Set(res.errors.filter((e) => e.startsWith(prefix)).map((e) => e.slice(prefix.length))));
    } else setError(t.errSave);
  }

  if (loadState === 'loading') return <div aria-hidden="true" className="h-64 rounded-card border border-subtle bg-cream-card" />;
  if (loadState !== 'ready') return <Alert>{loadState === 'not-configured' ? t.errNotConfigured : t.errLoad}</Alert>;

  const savedCurrent = current ? saved.find((h) => h.id === current.id) : undefined;
  const bad = (f: string) => fieldErrors.has(f);
  const previewHead: PublicHead | null = current
    ? {
        id: current.id,
        name: current.name || 'Naam',
        positions: current.positions.length ? current.positions : [{ af: 'Posisie', en: 'Position' }],
        photo: current.photo ?? { src: '', alt: '' },
        order: 0,
      }
    : null;

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section aria-labelledby="hl-h" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="hl-h" className="font-serif text-[26px] font-medium">
            {t.hdHeading} <span className="text-slate-muted">({items.length})</span>
          </h2>
          <button type="button" onClick={addNew} className={buttonAdd}>
            {t.hdAdd}
          </button>
        </div>
        <p className="mb-4 text-[14px] text-slate-muted">{t.hdHelp}</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(130px,100%),1fr))] gap-3">
          {items.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => select(i)}
                aria-label={fill(t.hdEditAria, { name: h.name || t.hdNewName })}
                aria-current={i === sel ? 'true' : undefined}
                className={`w-full overflow-hidden rounded-xl bg-cream-card text-left ${
                  i === sel ? 'border-2 border-navy' : 'border border-subtle'
                } ${h.visible && h.photo ? '' : 'opacity-60'}`}
              >
                <span
                  className="block aspect-[4/5] w-full"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--color-tan) 0 10px, var(--color-tan-border) 10px 20px)' }}
                >
                  {h.photo && <Thumb src={h.photo.src} alt="" className="h-full w-full object-cover object-top" />}
                </span>
                <span className="block p-2.5">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{h.name || t.hdNewName}</span>
                  <span className="block truncate text-[12px] text-slate">{h.positions[0]?.af || '—'}</span>
                  {!(h.visible && h.photo) && (
                    <span className="mt-1 inline-block rounded-pill bg-tan px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.06em] text-slate">
                      {t.hdHidden}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {current && previewHead && (
        <section aria-labelledby="pe-h" className={cardClass}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 id="pe-h" className="min-w-0 break-words font-serif text-[24px] font-medium">
              {current.name ? fill(t.hdEdit, { name: current.name }) : t.hdNew}
            </h2>
            <span className="flex gap-1.5">
              <IconButton label={t.hdEarlier} disabled={sel === 0} onClick={() => move(-1)}>
                <ArrowUp />
              </IconButton>
              <IconButton label={t.hdLater} disabled={sel === items.length - 1} onClick={() => move(1)}>
                <ArrowDown />
              </IconButton>
            </span>
          </div>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <span className={labelClass}>{t.hdHeadshot}</span>
              {/* The crop guide: the 4:5 frame the server cuts, and an oval for the face. */}
              <div
                ref={frameRef}
                className={`relative aspect-[4/5] w-full max-w-[200px] touch-none select-none overflow-hidden rounded-xl ${pending ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--color-tan) 0 10px, var(--color-tan-border) 10px 20px)' }}
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              >
                {pending ? (
                  <img
                    ref={imgRef}
                    src={pending.url}
                    alt=""
                    draggable={false}
                    onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="absolute max-w-none"
                    style={
                      geometry
                        ? { width: `${geometry.widthPct}%`, height: `${geometry.heightPct}%`, left: `${geometry.leftPct}%`, top: `${geometry.topPct}%` }
                        : { width: '100%', height: '100%', objectFit: 'cover', left: 0, top: 0 }
                    }
                  />
                ) : current.photo ? (
                  <Thumb src={current.photo.src} alt={fill(t.hdEditAria, { name: current.name })} className="h-full w-full object-cover object-top" />
                ) : (
                  <span className="flex h-full items-end justify-center pb-3 text-[12px] font-bold text-slate">{t.hdNoPhoto}</span>
                )}
                <span aria-hidden="true" className="pointer-events-none absolute left-[22%] top-[10%] h-[48%] w-[56%] rounded-[50%] border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(7,42,59,.18)]" />
              </div>
              {pending ? (
                <div className="mt-3 grid gap-2">
                  <p className="text-[12px] text-slate-muted">{t.hdDragHint}</p>
                  <label className="text-[12.5px] font-bold text-navy" htmlFor="hd-zoom">
                    {t.hdZoom}
                  </label>
                  <input id="hd-zoom" type="range" min={1} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="min-h-11 w-full accent-navy" />
                  <label className="text-[12.5px] font-bold text-navy" htmlFor="hd-pan-x">
                    {t.hdPanX}
                  </label>
                  <input id="hd-pan-x" type="range" min={0} max={1} step={0.01} value={pan.x} disabled={!geometry || geometry.roomX === 0} onChange={(e) => setPan((p) => ({ ...p, x: Number(e.target.value) }))} className="min-h-11 w-full accent-navy disabled:opacity-40" />
                  <label className="text-[12.5px] font-bold text-navy" htmlFor="hd-pan-y">
                    {t.hdPanY}
                  </label>
                  <input id="hd-pan-y" type="range" min={0} max={1} step={0.01} value={pan.y} disabled={!geometry || geometry.roomY === 0} onChange={(e) => setPan((p) => ({ ...p, y: Number(e.target.value) }))} className="min-h-11 w-full accent-navy disabled:opacity-40" />
                  <button type="button" className={buttonPrimary} onClick={upload} disabled={busy}>
                    {busy ? t.hdUploading : t.hdUsePhoto}
                  </button>
                  <button type="button" className={buttonSecondary} onClick={() => { readSeq.current += 1; setPending(null); }} disabled={busy}>
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <label className={`${buttonSecondary} mt-3 w-full max-w-[200px] cursor-pointer gap-2 focus-within:outline focus-within:outline-3 focus-within:outline-navy`}>
                  {t.hdReplace}
                  <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={choose} />
                </label>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-slate-muted">{t.hdPhotoHelp}</p>
              {uploadError && (
                <div className="mt-2">
                  <Alert>{uploadError}</Alert>
                </div>
              )}
            </div>

            <div className="grid content-start gap-4">
              <Field id="hd-name" label={t.hdName}>
                <TextInput id="hd-name" value={current.name} maxLength={80} placeholder="Naam / Name, bv. Jaco van Niekerk" onChange={(e) => patch((h) => ({ ...h, name: e.target.value }))} invalid={bad('name')} />
              </Field>
              <div>
                <span className={labelClass}>{t.hdPositions}</span>
                <ul className="grid gap-2">
                  {current.positions.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <TextInput
                        aria-label={`${fill(t.hdPosition, { n: i + 1 })} · ${t.afrikaans}`}
                        placeholder={t.afrikaans}
                        value={p.af}
                        maxLength={80}
                        invalid={bad(`positions.${i}.af`)}
                        onChange={(e) => patch((h) => ({ ...h, positions: h.positions.map((x, j) => (j === i ? { ...x, af: e.target.value } : x)) }))}
                      />
                      <TextInput
                        aria-label={`${fill(t.hdPosition, { n: i + 1 })} · ${t.english}`}
                        placeholder={t.english}
                        value={p.en}
                        maxLength={80}
                        invalid={bad(`positions.${i}.en`)}
                        onChange={(e) => patch((h) => ({ ...h, positions: h.positions.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) }))}
                      />
                      <IconButton
                        label={fill(t.hdRemovePosition, { n: i + 1 })}
                        disabled={current.positions.length === 1}
                        onClick={() => patch((h) => ({ ...h, positions: h.positions.filter((_, j) => j !== i) }))}
                      >
                        <Cross />
                      </IconButton>
                    </li>
                  ))}
                </ul>
                {current.positions.length < 6 && (
                  <button
                    type="button"
                    className="mt-2 min-h-11 text-[13.5px] font-bold text-navy underline"
                    onClick={() => patch((h) => ({ ...h, positions: [...h.positions, { af: '', en: '' }] }))}
                  >
                    {t.hdAddPosition}
                  </button>
                )}
              </div>
              <label className="flex min-h-11 items-center gap-3 text-[14px] font-bold text-ink">
                <input
                  type="checkbox"
                  checked={current.visible}
                  onChange={(e) => patch((h) => ({ ...h, visible: e.target.checked }))}
                  className="h-5 w-5 accent-navy"
                />
                {t.hdShow}
              </label>
              {current.visible && !current.photo && <p className="text-[12.5px] text-slate-muted">{t.hdNoPhotoHidden}</p>}
            </div>
          </div>

          <div className="mt-6 grid gap-6 border-t border-subtle pt-5 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <span className={labelClass}>{t.hdPreview}</span>
              <div className="w-[220px]" inert>
                <Card head={previewHead} lang="af" cdn="unavailable" sizer={!current.photo} />
              </div>
            </div>
            <div className="flex flex-col justify-end gap-3">
              <p className="text-[12.5px] text-slate-muted" aria-live="polite">
                {note}
                {savedCurrent && savedCurrent.updatedBy !== 'seed'
                  ? ` · ${fill(t.lastChange, { by: savedCurrent.updatedBy, at: formatWhen(savedCurrent.updatedAt, lang) })}`
                  : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {confirming ? (
                  <>
                    <button type="button" className={buttonDanger} onClick={removeCurrent}>
                      {fill(t.hdYesRemove, { name: current.name || t.hdNewName })}
                    </button>
                    <button type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>
                      {t.cancel}
                    </button>
                  </>
                ) : (
                  <button type="button" className={buttonDanger} onClick={() => setConfirming(true)}>
                    {t.hdRemove}
                  </button>
                )}
                <button type="button" className={`${buttonPrimary} ml-auto`} onClick={publish} disabled={busy || !dirty}>
                  {busy ? t.saving : t.publish}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
