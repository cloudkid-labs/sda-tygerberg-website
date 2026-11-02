import { useCallback, useEffect, useState } from 'react';
import { fill } from '../../../data/cmsCopy';
import { settingsCopy } from '../../../data/settingsCopy';
import { isEmail, normEmail } from '../../../lib/mailSettings';
import { Alert, buttonAdd, buttonSecondary, cardClass, cmsApi, inputClass, labelClass } from './ui';

type Item = { email: string; verified: boolean; notify: boolean; inUse: boolean };
type Listing = { configured: boolean; items: Item[]; remaining: number };

/**
 * Settings → Email settings → Destination addresses (SuperAdmins only, C-72).
 * Adds an address to the Cloudflare account, which emails its owner a
 * confirmation link; lists each one's state. Verified addresses become route
 * targets at once (`onChanged` refreshes the panel's choices); notifications
 * still need a deploy. Removing asks to confirm, and an address still in use
 * shows as such instead.
 */
export function DestinationsSection({ lang, onChanged }: { lang: 'af' | 'en'; onChanged: () => void }) {
  const t = settingsCopy[lang];
  const [listing, setListing] = useState<Listing | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState('');
  /** The address whose Remove was pressed, awaiting confirmation. */
  const [confirming, setConfirming] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await cmsApi<Listing>('GET', '/api/cms/destinations');
    if (!res.ok) return setError(res.outcome === 'upstream' ? t.destErrUpstream : t.destErrLoad);
    setListing(res.data);
    // A language switch must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const address = normEmail(email);
    setDone('');
    setError('');
    if (!isEmail(address)) return setInvalid(true);
    setInvalid(false);
    setBusy(true);
    const res = await cmsApi<Listing>('POST', '/api/cms/destinations', { email: address });
    setBusy(false);
    if (res.ok) {
      setListing(res.data);
      setEmail('');
      setDone(fill(t.destAdded, { email: address }));
      onChanged();
      return;
    }
    if (res.status === 400) setInvalid(true);
    setError(
      res.status === 400
        ? t.destErrInvalid
        : res.outcome === 'exists'
          ? t.destErrExists
          : res.status === 429
            ? t.destErrLimit
            : res.outcome === 'upstream'
              ? t.destErrUpstream
              : t.errSave,
    );
  }

  async function remove(address: string) {
    setDone('');
    setError('');
    setBusy(true);
    const res = await cmsApi<Listing>('DELETE', '/api/cms/destinations', { email: address });
    setBusy(false);
    setConfirming('');
    if (res.ok) {
      setListing(res.data);
      setDone(fill(t.destRemoved, { email: address }));
      onChanged();
      return;
    }
    setError(res.outcome === 'in-use' ? t.destErrInUse : res.outcome === 'upstream' ? t.destErrUpstream : t.errSave);
    if (res.outcome === 'not-found' || res.outcome === 'in-use') void load();
  }

  if (listing && !listing.configured) return null;
  const state = (d: Item) => (!d.verified ? t.destPending : d.notify ? t.destRoutesAndNotify : t.destRoutesOnly);

  return (
    <section aria-labelledby="st-dest" className={`${cardClass} grid gap-4`}>
      <h3 id="st-dest" className="font-serif text-[22px] font-medium text-ink">{t.destHeading}</h3>
      <p className="max-w-[640px] text-[14px] leading-relaxed text-slate">{t.destNote}</p>
      {error && <Alert>{error}</Alert>}
      {listing && (
        <>
          {listing.items.length === 0 ? (
            <p className="text-[14px] text-slate">{t.destEmpty}</p>
          ) : (
            <ul className="grid gap-2">
              {listing.items.map((d) => (
                <li key={d.email} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[10px] border border-subtle bg-white px-3.5 py-2.5 text-[14px]">
                  <span className="min-w-0 flex-1 basis-full break-all font-bold text-ink sm:basis-auto">{d.email}</span>
                  <span
                    className={`rounded-pill px-2.5 py-0.5 text-[12px] font-bold ${d.verified ? 'bg-tan text-navy' : 'bg-[#f6e3cf] text-[#9a4f0f]'}`}
                  >
                    {state(d)}
                  </span>
                  {d.inUse ? (
                    <span className="px-2 text-[12.5px] text-slate-muted">{t.destInUse}</span>
                  ) : confirming === d.email ? (
                    <span className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
                      <button
                        type="button"
                        className="min-h-11 rounded-pill bg-[#9a4f0f] px-4 text-[13px] font-bold text-white disabled:opacity-60"
                        disabled={busy}
                        onClick={() => void remove(d.email)}
                      >
                        {fill(t.destConfirm, { email: d.email })}
                      </button>
                      <button type="button" className="min-h-11 px-2 text-[13px] font-bold text-navy underline" onClick={() => setConfirming('')}>
                        {t.destCancel}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="min-h-11 px-2 text-[13px] font-bold text-[#9a4f0f] underline"
                      disabled={busy}
                      onClick={() => setConfirming(d.email)}
                    >
                      {t.destRemove}
                      <span className="sr-only"> {d.email}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <label className={labelClass} htmlFor="st-dest-new">{t.destAddLabel}</label>
              <input
                id="st-dest-new"
                type="email"
                className={inputClass}
                value={email}
                aria-invalid={invalid || undefined}
                disabled={busy || listing.remaining === 0}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
            </div>
            <button type="button" className={buttonAdd} disabled={busy || listing.remaining === 0} onClick={() => void add()}>
              {busy ? t.destAdding : t.destAdd}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12.5px] text-slate-muted">
              {listing.remaining === 0 ? t.destErrLimit : fill(t.destRemaining, { n: String(listing.remaining) })}
            </p>
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => {
                setDone('');
                void load().then(onChanged);
              }}
            >
              {t.destRefresh}
            </button>
          </div>
          <p aria-live="polite" className="text-[13.5px] font-bold text-navy">{done}</p>
        </>
      )}
    </section>
  );
}
