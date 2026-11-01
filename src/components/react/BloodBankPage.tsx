import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { BLOOD_DRIVE_SLOT_STARTS, slotRange } from '../../data/site';
import { bloodBankCopy } from '../../data/bloodBankCopy';
import { formatDate, weekdayOf } from '../../data/dateNames';
import { useUpcomingDrives } from '../../lib/useUpcomingDrives';
import type { TimeSlotsBlock } from '../../lib/cms/types';
import { StandardPage } from './StandardPage';

/**
 * The dates behind the home page's Bloedbank card, on the standard page
 * template — the first existing page moved onto it, as proof (C-70). The
 * content stays here rather than in the CMS: the dates come from the
 * BLOOD_DRIVES roster and expire on their own (C-36), which a hand-edited
 * block would not.
 *
 * Deliberately not a booking form. Nothing here takes a name or a phone number,
 * so there is no personal data to store and no consent to record (C-20, C-34) —
 * the page answers "when can I come" and stops there.
 */
function BloodBankContent() {
  const { lang } = useLanguage();
  const t = bloodBankCopy[lang];
  const drives = useUpcomingDrives();

  // Weekday derived from the date, never stored next to it — see
  // dateNames.ts. If this reads wrong, the date is wrong.
  const blocks: TimeSlotsBlock[] = drives.map((iso) => ({
    type: 'timeSlots',
    day: { af: weekdayOf(iso, 'af'), en: weekdayOf(iso, 'en') },
    title: { af: formatDate(iso, 'af'), en: formatDate(iso, 'en') },
    slots: BLOOD_DRIVE_SLOT_STARTS.map(slotRange),
  }));

  return (
    <StandardPage
      header={{
        eyebrow: { af: bloodBankCopy.af.eyebrow, en: bloodBankCopy.en.eyebrow },
        title: { af: bloodBankCopy.af.heading, en: bloodBankCopy.en.heading },
        intro: { af: bloodBankCopy.af.sub, en: bloodBankCopy.en.sub },
      }}
      blocks={blocks}
    >
      {drives.length === 0 && (
        <div className="rounded-card border border-subtle bg-cream-card p-7 text-center">
          <div className="mb-2 font-serif text-xl text-ink">{t.none}</div>
          <p className="text-[15px] leading-relaxed text-slate">{t.noneSub}</p>
        </div>
      )}
    </StandardPage>
  );
}

export function BloodBankPage() {
  return (
    <LanguageProvider>
      <BloodBankContent />
    </LanguageProvider>
  );
}
