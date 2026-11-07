import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { fill } from '../../../data/cmsCopy';
import { settingsCopy } from '../../../data/settingsCopy';
import { isEmail, normEmail, type MailSettings, type ProfileSetting, type SettingsOptions } from '../../../lib/mailSettings';
import { DestinationsSection } from './DestinationsSection';
import { PersonIdentity } from './PersonIdentity';
import { Alert, buttonAdd, buttonPrimary, buttonSecondary, cardClass, cmsApi, formatWhen, inputClass, labelClass } from './ui';

type Loaded = {
  rev: number;
  source: 'saved' | 'config';
  settings: MailSettings;
  options: SettingsOptions;
  updatedBy: string | null;
  updatedAt: string | null;
  heads: { id: string; name: string; photo: string | null }[];
  /** SuperAdmin with the Cloudflare token configured (C-72). */
  manageDestinations?: boolean;
};

const local = (address: string) => address.split('@')[0];
const sectionClass = `${cardClass} grid gap-4`;
const h2 = 'font-serif text-[22px] font-medium text-ink';
const note = 'max-w-[640px] text-[14px] leading-relaxed text-slate';

/**
 * The Settings tab (admins only, C-71): board members and their send-as
 * addresses, inbound routes and enquiry notifications. Everything the Worker
 * checks is re-checked on save (src/lib/mailSettings.ts); errors come back by
 * field and are shown where they belong.
 */
export function SettingsPanel() {
  const { lang } = useLanguage();
  const t = settingsCopy[lang];
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<MailSettings | null>(null);
  const [newMember, setNewMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [note2, setNote2] = useState('');
  /** Board members (who they are) or Email settings (what they send and receive). */
  const [sub, setSub] = useState<'people' | 'email'>('people');

  const load = useCallback(async () => {
    const res = await cmsApi<Loaded>('GET', '/api/cms/settings');
    if (!res.ok) return setError(res.status === 403 ? t.errForbidden : t.errLoad);
    setLoaded(res.data);
    setDraft(structuredClone(res.data.settings));
    setFieldErrors([]);
    // Reload on mount only; a language switch must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** New choices after a destination changed, keeping unsaved edits. */
  const refreshOptions = useCallback(async () => {
    const res = await cmsApi<Loaded>('GET', '/api/cms/settings');
    if (res.ok) setLoaded((prev) => (prev ? { ...prev, options: res.data.options } : prev));
  }, []);

  if (!loaded || !draft) return error ? <Alert>{error}</Alert> : null;
  const o = loaded.options;
  /** Notifications: the deploy's fenced destinations. */
  const pickable = o.destinations.filter((d) => d !== o.archive);
  /** Inbound routes: those plus any address verified since (C-72). */
  const routePickable = (o.routeDestinations ?? o.destinations).filter((d) => d !== o.archive);
  const has = (key: string) => fieldErrors.includes(key);
  const profileOf = (email: string) => draft.profiles.find((p) => p.email === email);
  const setProfile = (email: string, next: ProfileSetting | null) =>
    update({ ...draft, profiles: [...draft.profiles.filter((p) => p.email !== email), ...(next ? [next] : [])] });
  const profileIndex = (email: string) => draft.profiles.findIndex((p) => p.email === email);
  /** "Name · email" once Board members says who it is. */
  const displayName = (email: string) => {
    const p = profileOf(email);
    const name = p?.head ? loaded.heads.find((h) => h.id === p.head)?.name : p?.name;
    return name ? `${name} · ${email}` : email;
  };
  const identity = (email: string, idPrefix: string) => (
    <PersonIdentity
      email={email}
      idPrefix={idPrefix}
      profile={profileOf(email)}
      heads={loaded.heads}
      lang={lang}
      invalid={has(`profiles.${profileIndex(email)}`)}
      onChange={(next) => setProfile(email, next)}
    />
  );

  const update = (next: MailSettings) => {
    setDraft(next);
    setNote2('');
  };
  const toggleSendAs = (i: number, address: string) => {
    const members = draft.members.map((m, k) =>
      k !== i ? m : { ...m, sendAs: m.sendAs.includes(address) ? m.sendAs.filter((a) => a !== address) : [...m.sendAs, address].sort() },
    );
    update({ ...draft, members });
  };
  const addMember = () => {
    const email = normEmail(newMember);
    if (!isEmail(email) || draft.members.some((m) => m.email === email) || o.superAdmins.includes(email)) {
      setFieldErrors(['new.email']);
      return;
    }
    update({ ...draft, members: [...draft.members, { email, sendAs: [] }] });
    setNewMember('');
    setFieldErrors([]);
  };

  async function save() {
    if (!draft || !loaded) return;
    setBusy(true);
    setError('');
    setFieldErrors([]);
    const res = await cmsApi<Loaded>('PUT', '/api/cms/settings', { rev: loaded.rev, settings: draft });
    setBusy(false);
    if (res.ok) {
      // A save answers the settings, not the heads to choose from: keep those.
      setLoaded({ ...res.data, heads: res.data.heads ?? loaded.heads });
      setDraft(structuredClone(res.data.settings));
      setNote2(t.saved);
      return;
    }
    if (res.status === 409) {
      setError(t.errConflict);
      await load();
    } else if (res.status === 400) {
      setError(t.errInvalid);
      setFieldErrors(res.errors);
      const first = res.errors[0] ?? '';
      setSub(/^members\.\d+\.email$|^profiles/.test(first) ? 'people' : 'email');
    } else setError(res.status === 403 ? t.errForbidden : t.errSave);
  }

  const fieldError = (key: string, kind: keyof typeof t.fieldErrors) =>
    has(key) ? <p className="mt-1 text-[12.5px] font-bold text-[#9a4f0f]">{t.fieldErrors[kind]}</p> : null;

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="font-serif text-[28px] font-medium text-ink">{t.heading}</h2>
        <p className={`${note} mt-1.5`}>{t.intro}</p>
        <p className="mt-2 text-[12.5px] text-slate-muted">
          {loaded.source === 'config' || !loaded.updatedBy || !loaded.updatedAt
            ? t.fromConfig
            : fill(t.savedBy, { by: loaded.updatedBy, when: formatWhen(loaded.updatedAt, lang) })}
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      <nav aria-label={t.heading} className="flex flex-wrap gap-2">
        {(['people', 'email'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={sub === id ? 'page' : undefined}
            onClick={() => setSub(id)}
            className={`inline-flex min-h-11 items-center rounded-pill px-5 text-[14px] font-bold transition-colors ${
              sub === id ? 'bg-navy text-white' : 'border-[1.5px] border-navy text-navy hover:bg-navy/5'
            }`}
          >
            {id === 'people' ? t.tabPeople : t.tabEmail}
          </button>
        ))}
      </nav>

      {sub === 'people' && (
        <>

      <section aria-labelledby="st-admins" className={sectionClass}>
        <h3 id="st-admins" className={h2}>{t.adminsHeading}</h3>
        <p className={note}>{t.adminsNote}</p>
        <ul className="grid gap-2">
          {o.superAdmins.map((a) => (
            <li key={a} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[10px] bg-white px-3 py-2.5 text-[14px]">
              <span className="min-w-0 flex-1 basis-full break-all font-bold text-ink sm:basis-auto">{a}</span>
              <span className="rounded-pill bg-tan px-2.5 py-0.5 text-[12px] font-bold text-navy">{t.superAdmin}</span>
              <div className="basis-full">{identity(a, `st-admin-${o.superAdmins.indexOf(a)}`)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="st-members" className={sectionClass}>
        <h3 id="st-members" className={h2}>{t.membersHeading}</h3>
        <p className={note}>{t.membersNote}</p>
        <ul className="grid gap-2.5">
          {draft.members.map((m, i) => (
            <li key={m.email} className="grid min-w-0 gap-2 rounded-[10px] border border-subtle bg-white px-3.5 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-all text-[14.5px] font-bold text-ink">{m.email}</span>
                <button
                  type="button"
                  className="min-h-11 px-2 text-[13px] font-bold text-[#9a4f0f] underline"
                  onClick={() =>
                    update({ ...draft, members: draft.members.filter((_, k) => k !== i), profiles: draft.profiles.filter((p) => p.email !== m.email) })
                  }
                >
                  {t.remove}
                  <span className="sr-only"> {m.email}</span>
                </button>
              </div>
              <label className="inline-flex min-h-11 items-center gap-2.5 text-[14px] font-bold text-navy">
                <input
                  type="checkbox"
                  className="size-[18px] shrink-0 accent-navy"
                  checked={Boolean(m.admin)}
                  onChange={(e) =>
                    update({
                      ...draft,
                      members: draft.members.map((x, k) => (k !== i ? x : e.target.checked ? { ...x, admin: true } : { email: x.email, sendAs: x.sendAs })),
                    })
                  }
                />
                {t.adminToggle}
              </label>
              {identity(m.email, `st-m-${i}`)}
              {has(`profiles.${profileIndex(m.email)}`) && <p className="text-[12.5px] font-bold text-[#9a4f0f]">{t.fieldErrors.profile}</p>}
              {fieldError(`members.${i}.email`, 'email')}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label className={labelClass} htmlFor="st-new-member">{t.addMemberLabel}</label>
            <input
              id="st-new-member"
              type="email"
              className={inputClass}
              value={newMember}
              aria-invalid={has('new.email') || undefined}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMember();
                }
              }}
            />
          </div>
          <button type="button" className={buttonAdd} onClick={addMember}>
            {t.addMember}
          </button>
        </div>
        {fieldError('new.email', 'email')}
      </section>

        </>
      )}

      {sub === 'email' && (
        <>
      <section aria-labelledby="st-sendas" className={sectionClass}>
        <h3 id="st-sendas" className={h2}>{t.sendAsHeading}</h3>
        <p className={note}>{t.sendAsNote}</p>
        {o.senders.length === 0 && <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13.5px] text-slate">{t.noDestinations}</p>}
        <ul className="grid gap-2.5">
          {o.superAdmins.map((a) => (
            <li key={a} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[10px] bg-white px-3.5 py-3 text-[14px]">
              <span className="min-w-0 flex-1 basis-full break-all font-bold text-ink sm:basis-auto">{displayName(a)}</span>
              <span className="rounded-pill bg-tan px-2.5 py-0.5 text-[12px] font-bold text-navy">{t.adminEverything}</span>
            </li>
          ))}
          {draft.members.map((m, i) => (
            <li key={m.email} className="grid min-w-0 gap-1.5 rounded-[10px] border border-subtle bg-white px-3.5 py-3">
              <span className="min-w-0 break-all text-[14.5px] font-bold text-ink">{displayName(m.email)}</span>
              {m.admin ? (
                <span className="w-fit rounded-pill bg-tan px-2.5 py-0.5 text-[12px] font-bold text-navy">{t.adminEveryRole}</span>
              ) : (
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                <legend className="sr-only">{m.email}</legend>
                {o.senders.map((s) => (
                  <label key={s} className="inline-flex min-h-11 items-center gap-2 text-[14px] text-ink">
                    <input type="checkbox" className="size-[18px] accent-navy" checked={m.sendAs.includes(s)} onChange={() => toggleSendAs(i, s)} />
                    {local(s)}@
                  </label>
                ))}
              </fieldset>
              )}
              {!m.admin && m.sendAs.length === 0 && <p className="text-[12.5px] text-slate-muted">{t.noAddresses}</p>}
              {fieldError(`members.${i}.sendAs`, 'sendAs')}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="st-routes" className={sectionClass}>
        <h3 id="st-routes" className={h2}>{t.routesHeading}</h3>
        <p className={note}>{t.routesNote}</p>
        <ul className="grid gap-2.5">
          {draft.routes.map((r, i) => (
            <li key={i} className="grid min-w-0 gap-2 rounded-[10px] border border-subtle bg-white px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <label className={labelClass} htmlFor={`st-r-a-${i}`}>{t.routeAddress}</label>
                <div className="flex min-w-0 items-center gap-1.5">
                  <input
                    id={`st-r-a-${i}`}
                    className={inputClass}
                    value={local(r.address)}
                    aria-invalid={has(`routes.${i}.address`) || undefined}
                    onChange={(e) => {
                      const routes = draft.routes.map((x, k) => (k === i ? { ...x, address: `${e.target.value.trim().toLowerCase()}@${o.domain}` } : x));
                      update({ ...draft, routes });
                    }}
                  />
                  <span className="shrink-0 text-[14px] text-slate">@{o.domain}</span>
                </div>
                {fieldError(`routes.${i}.address`, 'address')}
              </div>
              <div className="min-w-0">
                <label className={labelClass} htmlFor={`st-r-t-${i}`}>{t.routeTo}</label>
                <select
                  id={`st-r-t-${i}`}
                  className={inputClass}
                  value={r.to}
                  aria-invalid={has(`routes.${i}.to`) || undefined}
                  onChange={(e) => update({ ...draft, routes: draft.routes.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })}
                >
                  {!routePickable.includes(r.to) && <option value={r.to}>{r.to || '—'}</option>}
                  {routePickable.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {fieldError(`routes.${i}.to`, 'to')}
              </div>
              <button
                type="button"
                className="min-h-11 px-2 text-[13px] font-bold text-[#9a4f0f] underline"
                onClick={() => update({ ...draft, routes: draft.routes.filter((_, k) => k !== i) })}
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
        {routePickable.length === 0 ? (
          // Nowhere mail may go (devtest has mail off, C-61): say so rather
          // than offer a button that cannot do anything.
          <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13.5px] text-slate">{t.noDestinations}</p>
        ) : (
          <div>
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => update({ ...draft, routes: [...draft.routes, { address: `@${o.domain}`, to: routePickable[0] }] })}
            >
              {t.addRoute}
            </button>
          </div>
        )}
        <ul className="grid gap-1 text-[13.5px] text-slate">
          {o.forwardTo && <li>{fill(t.everythingElse, { to: o.forwardTo })}</li>}
          {o.archive && <li>{fill(t.archiveCopy, { to: o.archive })}</li>}
        </ul>
      </section>

      <section aria-labelledby="st-notify" className={sectionClass}>
        <h3 id="st-notify" className={h2}>{t.notifyHeading}</h3>
        <p className={note}>{t.notifyNote}</p>
        {pickable.length === 0 && <p className="rounded-[10px] bg-tan px-3.5 py-2.5 text-[13.5px] text-slate">{t.noDestinations}</p>}
        <fieldset className="grid gap-1">
          <legend className="sr-only">{t.notifyHeading}</legend>
          {pickable.map((d) => (
            <label key={d} className="inline-flex min-h-11 items-center gap-2.5 break-all text-[14.5px] text-ink">
              <input
                type="checkbox"
                className="size-[18px] shrink-0 accent-navy"
                checked={draft.notify.includes(d)}
                onChange={() =>
                  update({ ...draft, notify: draft.notify.includes(d) ? draft.notify.filter((a) => a !== d) : [...draft.notify, d].sort() })
                }
              />
              {d}
            </label>
          ))}
        </fieldset>
        {(has('notify') || has('notify.empty')) && <p className="text-[12.5px] font-bold text-[#9a4f0f]">{t.fieldErrors.notify}</p>}
        <p className="text-[12.5px] text-slate-muted">{t.destinationsNote}</p>
      </section>

        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonPrimary} disabled={busy} onClick={save}>
          {busy ? t.saving : t.save}
        </button>
        <p aria-live="polite" className="text-[13.5px] font-bold text-navy">{note2}</p>
      </div>

      {/* Its own action, not part of Save settings: it changes Cloudflare. */}
      {sub === 'email' && loaded.manageDestinations && <DestinationsSection lang={lang} onChanged={() => void refreshOptions()} />}
    </div>
  );
}
