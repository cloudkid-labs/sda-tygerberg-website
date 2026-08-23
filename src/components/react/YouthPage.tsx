import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { DIVINE_SERVICE, SITE, serviceRange } from '../../data/site';
import { youthCopy } from '../../data/youthCopy';
import {
  SABBATH_YOUTH_GROUPS,
  YOUTH_EVENING,
  ageRange,
  sabbathGroupsRange,
  youthEveningRange,
} from '../../data/youthGroups';
import { withBase } from '../../lib/base';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/**
 * What the church runs for under-18s, behind the week grid's Jeugaand card.
 *
 * Two questions, in the order they get asked: when is the Friday evening, and
 * is there something for my child on a Sabbath morning. Everything on the page
 * serves one of those. It names no volunteers (C-38) and takes no bookings
 * (C-37) — there is no form here and nothing to store.
 */
function YouthContent() {
  const { lang } = useLanguage();
  const t = youthCopy[lang];

  // The service the children join, by name and by id — not `SERVICE_TIMES.at(-1)`,
  // which was right only for as long as it stayed last in the array. Reordering
  // the morning would have had this page naming Lesson Study. C-53
  const divine = DIVINE_SERVICE;

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[780px] px-5 pb-10 pt-14 text-center sm:px-7 sm:pt-16">
          <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">
            {t.eyebrow}
          </div>
          <h1 className="mb-4 text-balance font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
            {t.heading}
          </h1>
          <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
          <p className="mx-auto max-w-[560px] text-[16.5px] leading-relaxed text-slate">{t.sub}</p>
        </section>

        {/* The Friday evening. One card rather than a list: it is a single
            standing appointment, and the page is reached from a card that has
            already said "Vrydag" — this confirms it and adds the address. */}
        <section className="mx-auto max-w-[780px] px-5 pb-12 sm:px-7">
          <div className="rounded-card-lg border border-subtle border-t-2 border-t-orange bg-cream-card p-6 shadow-card sm:p-7">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-[.08em] text-orange">
              {t.everyPrefix} {YOUTH_EVENING.day[lang]}
            </div>
            <div className="mb-5 font-serif text-[28px] leading-tight text-ink tabular-nums">
              {youthEveningRange}
            </div>
            {/* No "when" row: the eyebrow and the time above it are the when,
                and a card that says Friday twice reads as two appointments. */}
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[.12em] text-slate-muted">
              {t.whereLabel}
            </div>
            <div className="text-[14.5px] leading-relaxed text-ink">{SITE.address}</div>
            <p className="mt-5 text-[13.5px] font-bold text-slate">{t.noBooking}</p>
          </div>
        </section>

        <section className="mx-auto max-w-[780px] px-5 pb-16 sm:px-7">
          <h2 className="mb-2 font-serif text-[28px] font-medium text-ink">{t.sabbathHeading}</h2>
          <p className="mb-6 text-[15.5px] leading-relaxed text-slate">{t.sabbathSub}</p>

          {/* The window is printed once, above the grid, rather than repeated on
              five identical cards. Every group runs in the same slot, and five
              copies of one time reads as five separate facts to check. */}
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-subtle pb-4">
            <span className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-muted">
              {t.groupsLabel}
            </span>
            <span className="font-bold tabular-nums text-ink">{sabbathGroupsRange}</span>
          </div>

          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
            {SABBATH_YOUTH_GROUPS.map((group) => (
              <li
                key={group.id}
                className="rounded-card border border-subtle bg-cream-card p-5"
              >
                {/* The age band leads, not the group's name: a parent is
                    scanning for their child's age, and "Kindertuin" only means
                    something to someone who already knows. */}
                <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange tabular-nums">
                  {ageRange(group)} {t.yearsLabel}
                </div>
                <div className="mb-1.5 font-serif text-xl text-ink">{group.name[lang]}</div>
                {/* Absent rather than empty: emptying a blurb is how a
                    description gets retracted without losing the age band —
                    see youthGroups.ts. */}
                {group.blurb[lang] && (
                  <p className="text-[13.5px] leading-relaxed text-slate">{group.blurb[lang]}</p>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[14.5px] leading-relaxed text-slate">
              <span className="font-bold text-ink">{t.afterLabel} · </span>
              {t.afterNote}{' '}
              <span className="font-bold text-ink">{divine[lang]}</span>{' '}
            <span className="tabular-nums">({serviceRange(divine)})</span>.
          </p>
        </section>

        <section className="mx-auto max-w-[780px] px-5 pb-16 sm:px-7">
          <div className="rounded-card-lg border border-orange/40 bg-orange/10 p-6 sm:p-7">
            <h2 className="mb-2 font-serif text-xl text-navy">{t.ctaHeading}</h2>
            <p className="mb-5 text-[14.5px] leading-relaxed text-slate">{t.ctaBody}</p>
            {/* /connect, not an address on the page — C-20 keeps every phone
                number and email address off the site. */}
            <a
              href={withBase('/connect/')}
              className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-orange px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-orange-hover"
            >
              {t.ctaLabel} →
            </a>
          </div>
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function YouthPage() {
  return (
    <LanguageProvider>
      <YouthContent />
    </LanguageProvider>
  );
}
