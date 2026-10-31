import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Shared pieces of the CMS editors (CMS-* artboards). Every control is a real
 * element with a label and a 44px target.
 */

export const inputClass =
  'w-full min-h-11 rounded-xl border border-strong bg-white px-3.5 text-[15px] text-ink focus:border-navy focus:outline-none focus:ring-[3px] focus:ring-navy/15 aria-[invalid=true]:border-[#b3261e]';
export const labelClass = 'mb-1.5 block text-[13px] font-bold text-navy';
export const cardClass = 'min-w-0 rounded-card-lg border border-subtle bg-cream-card p-5 shadow-card sm:p-7';

export const buttonPrimary =
  'inline-flex min-h-11 items-center justify-center rounded-pill bg-navy px-[22px] text-[14px] font-bold text-white hover:bg-ink disabled:opacity-60';
export const buttonSecondary =
  'inline-flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-navy px-[18px] text-[14px] font-bold text-navy hover:bg-navy/5 disabled:opacity-60';
export const buttonDanger =
  'inline-flex min-h-11 items-center justify-center rounded-pill border-[1.5px] border-[#9a4f0f] px-[18px] text-[14px] font-bold text-[#9a4f0f] hover:bg-[#9a4f0f]/5';
/** Orange fill, dark label — the canvas decision for new UI; AA on #e8862c. */
export const buttonAdd =
  'inline-flex min-h-11 items-center justify-center rounded-pill bg-orange px-[18px] text-[14px] font-bold text-ink hover:bg-orange-hover';

export function IconButton({ label, children, ...rest }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-ink/20 bg-white text-navy hover:border-navy disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

const icon = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const ArrowUp = () => icon('M12 19V5M5 12l7-7 7 7');
export const ArrowDown = () => icon('M12 5v14M19 12l-7 7-7-7');
export const Cross = () => icon('M18 6 6 18M6 6l12 12');

export function Field({ id, label, hint, children }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] text-slate-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ invalid, ...rest }: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={inputClass} aria-invalid={invalid || undefined} {...rest} />;
}

export function StatusBadge({ live, liveLabel, draftLabel }: { live: boolean; liveLabel: string; draftLabel: string }) {
  return (
    <span
      className={`flex-none rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.06em] ${
        live ? 'bg-blue-pale text-navy' : 'bg-tan text-slate'
      }`}
    >
      {live ? liveLabel : draftLabel}
    </span>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-[14px] text-ink">
      {children}
    </p>
  );
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; outcome: string; errors: string[] };

/** JSON to and from /api/cms/*. Never throws; a network failure is status 0. */
export async function cmsApi<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && data.ok) return { ok: true, data: data as T };
    return {
      ok: false,
      status: res.status,
      outcome: typeof data.outcome === 'string' ? data.outcome : 'error',
      errors: Array.isArray(data.errors) ? (data.errors as string[]) : [],
    };
  } catch {
    return { ok: false, status: 0, outcome: 'network', errors: [] };
  }
}

export function formatWhen(iso: string, lang: 'af' | 'en'): string {
  try {
    return new Date(iso).toLocaleString(lang === 'af' ? 'af-ZA' : 'en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** A short random id for a new item: lowercase, safe for R2 keys and URLs. */
export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
