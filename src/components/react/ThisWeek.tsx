import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { bloodBankCopy } from '../../data/bloodBankCopy';
import { formatDate } from '../../data/dateNames';
import { BLOOD_DRIVE_SLOT_STARTS } from '../../data/site';
import { useUpcomingDrives } from '../../lib/useUpcomingDrives';
import { withBase } from '../../lib/base';

export function ThisWeek() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const bb = bloodBankCopy[lang];

  const drives = useUpcomingDrives();
  // Every drive offers the same slots, so the count is a multiplication rather
  // than a per-date sum. It counts bookable sessions, not dates — which is what
  // the card says, and what /blood-bank then lists.
  const sessions = drives.length * BLOOD_DRIVE_SLOT_STARTS.length;

  return (
    <section id="week" className="mx-auto max-w-content scroll-mt-24 px-7 py-16">
      <h2 className="mb-2 font-serif text-[34px] font-medium text-ink">{t.weekHeading}</h2>
      <p className="mb-8 text-slate">{t.weekSub}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        {t.week.map((entry) => {
          const body = (
            <>
              <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">
                {entry.day}
              </div>
              <div className="mb-1.5 font-serif text-xl text-ink">{entry.name}</div>
              <div className="text-[13px] font-bold text-slate">{entry.time}</div>
              {/* Where it happens, when the card names one. The grid's heading
                  promises "by die kerk" while some entries are elsewhere. */}
              {entry.place && <div className="mt-1 text-[13px] text-slate-muted">{entry.place}</div>}
              {entry.more && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-slate">
                  {entry.more}
                  <span className="text-orange">→</span>
                </div>
              )}
            </>
          );

          // An entry with a page behind it wears the orange top border, so it
          // reads as clickable from across the grid — the same treatment the
          // blood bank card gets below, and for the same reason. Two branches
          // rather than a computed tag name: an anchor and a div do not take
          // the same props, and the compiler should be able to see that.
          //
          // Keyed on day and name: Wednesday carries two cards (daytime
          // counselling, evening Bible study), so the day alone is not unique.
          return entry.href ? (
            <a
              key={`${entry.day}-${entry.name}`}
              href={withBase(entry.href)}
              className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card transition-colors hover:border-orange"
            >
              {body}
            </a>
          ) : (
            <div key={`${entry.day}-${entry.name}`} className="rounded-card border border-subtle bg-cream-card p-5">
              {body}
            </div>
          );
        })}
        {/* The fifth card. Monthly rather than weekly, so it leads with the next
            date where the others lead with a weekday, and it is a link because
            the dates and slots behind it do not fit a card. An exhausted roster
            renders nothing rather than a card promising a drive that is not
            scheduled — the same call the FAQ makes when `firstVisit` empties. */}
        {drives.length > 0 && (
          <a
            href={withBase('/blood-bank/')}
            className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card transition-colors hover:border-orange"
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">
              {formatDate(drives[0], lang)}
            </div>
            <div className="mb-1.5 font-serif text-xl text-ink">{t.bloodBankName}</div>
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate">
              {sessions} {sessions === 1 ? bb.session : bb.sessions}
              <span className="text-orange">→</span>
            </div>
          </a>
        )}
      </div>
    </section>
  );
}
