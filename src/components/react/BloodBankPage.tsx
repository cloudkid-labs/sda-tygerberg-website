import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { BLOOD_DRIVE_SLOT_STARTS, slotRange } from '../../data/site';
import { bloodBankCopy } from '../../data/bloodBankCopy';
import { formatDate, weekdayOf } from '../../data/dateNames';
import { useUpcomingDrives } from '../../lib/useUpcomingDrives';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/**
 * The dates behind the home page's Bloedbank card.
 *
 * Deliberately not a booking form. Nothing here takes a name or a phone number,
 * so there is no personal data to store and no consent to record (C-20, C-34) —
 * the page answers "when can I come" and stops there.
 */
function BloodBankContent() {
  const { lang } = useLanguage();
  const t = bloodBankCopy[lang];
  const drives = useUpcomingDrives();

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[720px] px-5 pb-10 pt-14 text-center sm:px-7 sm:pt-16">
          <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">
            {t.eyebrow}
          </div>
          <h1 className="mb-4 text-balance font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
            {t.heading}
          </h1>
          <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
          <p className="mx-auto max-w-[560px] text-[16.5px] leading-relaxed text-slate">{t.sub}</p>
        </section>

        <section className="mx-auto max-w-[720px] px-5 pb-16 sm:px-7">
          {drives.length === 0 ? (
            <div className="rounded-card border border-subtle bg-cream-card p-7 text-center">
              <div className="mb-2 font-serif text-xl text-ink">{t.none}</div>
              <p className="text-[15px] leading-relaxed text-slate">{t.noneSub}</p>
            </div>
          ) : (
            <ul className="grid gap-4">
              {drives.map((iso) => (
                <li
                  key={iso}
                  className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card sm:p-6"
                >
                  {/* Weekday derived from the date, never stored next to it —
                      see dateNames.ts. If this reads wrong, the date is wrong. */}
                  <div className="mb-1 text-xs font-bold uppercase tracking-[.08em] text-orange">
                    {weekdayOf(iso, lang)}
                  </div>
                  <div className="mb-4 font-serif text-xl text-ink">{formatDate(iso, lang)}</div>

                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-slate-muted">
                    {t.slotsLabel}
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {BLOOD_DRIVE_SLOT_STARTS.map((start) => (
                      <li
                        key={start}
                        className="rounded-pill border border-subtle bg-white px-3.5 py-1.5 text-[13px] font-bold text-slate"
                      >
                        {slotRange(start)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function BloodBankPage() {
  return (
    <LanguageProvider>
      <BloodBankContent />
    </LanguageProvider>
  );
}
