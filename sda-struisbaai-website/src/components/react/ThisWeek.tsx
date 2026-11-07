import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { bloodBankCopy } from '../../data/bloodBankCopy';
import { formatDate } from '../../data/dateNames';
import { BLOOD_DRIVE_SLOT_STARTS, type Lang } from '../../data/site';
import { withBase } from '../../lib/base';
import { useUpcomingDrives } from '../../lib/useUpcomingDrives';
import { isExpired, johannesburgDate } from '../../lib/cms/time';
import type { HomePayload } from '../../lib/cms/types';
import { FEATURE_FLAGS } from '../../data/featureFlags';
import { timeRange } from '../../lib/cms/time';
import type { PublicEvent, WeekdayAf } from '../../lib/cms/types';

const WEEKDAY_EN: Record<WeekdayAf, string> = {
  Sondag: 'Sunday',
  Maandag: 'Monday',
  Dinsdag: 'Tuesday',
  Woensdag: 'Wednesday',
  Donderdag: 'Thursday',
  Vrydag: 'Friday',
  Sabbat: 'Sabbath',
};

/** The card's orange label: the weekday, or the date of a once-off. */
export function eventLabel(event: Pick<PublicEvent, 'kind' | 'day' | 'date'>, lang: Lang): string {
  if (event.kind === 'once' && event.date) return formatDate(event.date, lang);
  const day = event.day ?? 'Sondag';
  return lang === 'af' ? day : WEEKDAY_EN[day];
}

/** One card. Exported for the CMS editor's live preview. */
export function WeekCard({ event, lang }: { event: PublicEvent; lang: Lang }) {
  const body = (
    <>
      <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">{eventLabel(event, lang)}</div>
      <div className="mb-1.5 font-serif text-xl text-ink">{event.name[lang]}</div>
      <div className="text-[13px] font-bold text-slate">{timeRange(event.start, event.end)}</div>
      {/* Where it happens, when the card names one. The grid's heading
          promises "by die kerk" while some entries are elsewhere. */}
      {event.where[lang] && <div className="mt-1 text-[13px] text-slate-muted">{event.where[lang]}</div>}
      {event.link && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-slate">
          {event.link.label[lang]}
          <span className="text-orange">→</span>
        </div>
      )}
    </>
  );

  // An entry with a page behind it wears the orange top border, so it reads as
  // clickable from across the grid — the same treatment the blood bank card
  // gets below, and for the same reason. Two branches rather than a computed
  // tag name: an anchor and a div do not take the same props.
  return event.link ? (
    <a
      href={withBase(`/${event.link.pageSlug}/`)}
      className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card transition-colors hover:border-orange"
    >
      {body}
    </a>
  ) : (
    <div className="rounded-card border border-subtle bg-cream-card p-5">{body}</div>
  );
}

/**
 * "Hierdie week": the CMS's live events, then the blood bank card.
 *
 * `data` is the page's payload — the build's seed, or the live content the
 * Worker swapped in for this request (C-70). The first render uses only what
 * the payload says, `asOf` included, so it matches the HTML exactly; the
 * visitor's own date narrows the list one tick after mount (C-36).
 */
export function ThisWeek({ data }: { data: HomePayload }) {
  const { lang } = useLanguage();
  const t = homeCopy[lang];
  const bb = bloodBankCopy[lang];
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    if (FEATURE_FLAGS.weekEvents) setToday(johannesburgDate(new Date()));
  }, []);
  const events = FEATURE_FLAGS.weekEvents
    ? today ? data.events.filter((e) => !isExpired(e, today)) : data.events
    : [];
  const drives = useUpcomingDrives(data.asOf, FEATURE_FLAGS.bloodBankCard);
  const sessions = drives.length * BLOOD_DRIVE_SLOT_STARTS.length;

  return (
    <section id="week" className="mx-auto max-w-content scroll-mt-24 px-7 py-16">
      <h2 className="mb-2 font-serif text-[34px] font-medium text-ink">{t.weekHeading}</h2>
      <p className="mb-8 text-slate">{t.weekSub}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        <div className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card">
          <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">
            {lang === 'af' ? 'Weeksdae' : 'Weekdays'}
          </div>
          <div className="mb-1.5 font-serif text-xl text-ink">
            {lang === 'af' ? 'Bybelstudie' : 'Bible study'}
          </div>
          <div className="text-[13px] font-bold text-slate">19:00 – 20:00</div>
        </div>
        {FEATURE_FLAGS.weekEvents && events.map((event) => (
          <WeekCard key={event.id} event={event} lang={lang} />
        ))}
        {FEATURE_FLAGS.bloodBankCard && drives.length > 0 && (
          <a href={withBase('/blood-bank/')} className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card">
            <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">{formatDate(drives[0], lang)}</div>
            <div className="mb-1.5 font-serif text-xl text-ink">{t.bloodBankName}</div>
            <div className="text-[13px] font-bold text-slate">{sessions} {sessions === 1 ? bb.session : bb.sessions}</div>
          </a>
        )}
      </div>
    </section>
  );
}
