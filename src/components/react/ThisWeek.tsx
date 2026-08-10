import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { BLOOD_DRIVES } from '../../data/site';

/** `YYYY-MM-DD` in local time. Not `toISOString()`, which converts to UTC and
 *  rolls the date over for the first two hours of every SAST day. */
function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ThisWeek() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];

  // Read after mount, not during render — CONCERNS.md C-36.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(today()), []);

  const drives = now ? BLOOD_DRIVES.filter((d) => d >= now) : BLOOD_DRIVES;

  const formatDrive = (iso: string) => {
    const [year, month, day] = iso.split('-');
    return `${Number(day)} ${t.months[Number(month) - 1]} ${year}`;
  };

  return (
    <section id="week" className="mx-auto max-w-content scroll-mt-24 px-7 py-16">
      <h2 className="mb-2 font-serif text-[34px] font-medium text-ink">{t.weekHeading}</h2>
      <p className="mb-8 text-slate">{t.weekSub}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        {t.week.map((entry) => (
          <div
            key={entry.day}
            className="rounded-card border border-subtle bg-cream-card p-5"
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">
              {entry.day}
            </div>
            <div className="mb-1.5 font-serif text-xl text-ink">{entry.name}</div>
            <div className="text-[13px] font-bold text-slate">{entry.time}</div>
          </div>
        ))}
        {/* Monthly rather than weekly, so it sits in the same grid but carries a
            date where the others carry a weekday. An exhausted roster renders
            nothing at all rather than a card promising a drive that is not
            scheduled — the same call the FAQ makes when `firstVisit` empties. */}
        {drives.map((iso) => (
          <div key={iso} className="rounded-card border border-subtle bg-cream-card p-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">
              {formatDrive(iso)}
            </div>
            <div className="mb-1.5 font-serif text-xl text-ink">{t.bloodBankName}</div>
            <div className="text-[13px] font-bold text-slate">{t.bloodBankTime}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
