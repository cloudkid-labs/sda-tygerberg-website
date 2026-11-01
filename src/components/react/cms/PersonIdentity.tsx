import { useState } from 'react';
import { settingsCopy } from '../../../data/settingsCopy';
import type { ProfileSetting } from '../../../lib/mailSettings';
import { Avatar } from '../Avatar';
import { inputClass, labelClass } from './ui';

type Head = { id: string; name: string; photo: string | null };

/**
 * Who a sign-in address belongs to, in Settings (C-71): their department-head
 * (HOD) entry — name and headshot from there — or, ticked as a board member
 * with no HOD position, a name typed in and an optional profile picture.
 */
export function PersonIdentity({
  email,
  idPrefix,
  profile,
  heads,
  invalid,
  lang,
  onChange,
}: {
  email: string;
  idPrefix: string;
  profile: ProfileSetting | undefined;
  heads: Head[];
  invalid: boolean;
  lang: 'af' | 'en';
  onChange: (next: ProfileSetting | null) => void;
}) {
  const t = settingsCopy[lang];
  const override = Boolean(profile && !profile.head);
  const head = profile?.head ? (heads ?? []).find((h) => h.id === profile.head) : undefined;
  const picture = override ? profile?.photo : head?.photo;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function upload(file: File) {
    if (!profile) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/cms/media?kind=profile&focus=0.3', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; src?: string };
      if (!res.ok || !data.ok || !data.src) throw new Error(String(res.status));
      onChange({ ...profile, photo: data.src });
    } catch {
      setUploadError(t.photoError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-2.5 rounded-[10px] bg-cream-card/60 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar src={picture} size={44} />
        <div className="grid min-w-0 flex-1 gap-2.5">
          <label className="inline-flex min-h-11 items-center gap-2.5 text-[14px] text-ink">
            <input
              type="checkbox"
              className="size-[18px] shrink-0 accent-navy"
              checked={override}
              onChange={(e) => onChange(e.target.checked ? { email, name: head?.name ?? '' } : null)}
            />
            {t.notHod}
          </label>

          {override ? (
            <>
              <div className="min-w-0 sm:max-w-[360px]">
                <label className={labelClass} htmlFor={`${idPrefix}-name`}>{t.nameLabel}</label>
                <input
                  id={`${idPrefix}-name`}
                  className={inputClass}
                  maxLength={80}
                  value={profile?.name ?? ''}
                  aria-invalid={invalid || undefined}
                  onChange={(e) => profile && onChange({ ...profile, name: e.target.value })}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <span className={labelClass}>
                  {t.photoLabel} <span className="font-normal text-slate-muted">({t.photoOptional})</span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center rounded-pill border-[1.5px] border-navy px-[18px] text-[14px] font-bold text-navy hover:bg-navy/5">
                    {uploading ? t.photoUploading : t.photoUpload}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void upload(file);
                      }}
                    />
                  </label>
                  {profile?.photo && (
                    <button
                      type="button"
                      className="min-h-11 px-2 text-[13px] font-bold text-[#9a4f0f] underline"
                      onClick={() => {
                        if (!profile) return;
                        const { photo: _p, ...rest } = profile;
                        onChange(rest);
                      }}
                    >
                      {t.photoRemove}
                    </button>
                  )}
                </div>
                {uploadError && <p className="text-[12.5px] font-bold text-[#9a4f0f]">{uploadError}</p>}
              </div>
            </>
          ) : (
            <div className="min-w-0 sm:max-w-[360px]">
              <label className={labelClass} htmlFor={`${idPrefix}-hod`}>{t.hodLabel}</label>
              <select
                id={`${idPrefix}-hod`}
                className={inputClass}
                value={profile?.head ?? ''}
                aria-invalid={invalid || undefined}
                onChange={(e) => onChange(e.target.value ? { email, head: e.target.value } : null)}
              >
                <option value="">{t.hodChoose}</option>
                {(heads ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name || h.id}
                    {h.photo ? '' : ` (${t.headshotNoPhoto})`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
