import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { SITE, SERVICE_TIMES, serviceRange } from '../../data/site';
import { requestFormCopy, requestTopics, type RequestTopic } from '../../data/requestCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';
import { RequestForm } from './RequestForm';
import { SocialLinks } from './SocialLinks';

/**
 * Shell for the two request pages. /connect and /bible-studies are the same
 * page with different copy — `topic` picks the copy and is also what the
 * Worker uses to route the submission (see src/data/requestCopy.ts).
 *
 * The address / service-times block below the form is deliberate: if the form
 * is unavailable (no Worker on the devtest preview, or no webhook configured
 * yet) the page still answers "how do I reach these people".
 */
function RequestContent({ topic }: { topic: RequestTopic }) {
  const { lang } = useLanguage();
  const copy = requestTopics[topic][lang];
  const t = requestFormCopy[lang];

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">

      <section className="mx-auto max-w-[720px] px-5 pb-10 pt-14 text-center sm:px-7 sm:pt-16">
        <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">
          {copy.eyebrow}
        </div>
        <h1 className="mb-4 text-balance font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
          {copy.heading}
        </h1>
        <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
        <p className="mx-auto max-w-[560px] text-[16.5px] leading-relaxed text-slate">{copy.sub}</p>
      </section>

      <section className="mx-auto max-w-[720px] px-5 pb-16 sm:px-7">
        <ul className="mb-9 grid gap-3">
          {copy.expectations.map((line) => (
            <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-slate">
              {/* A tick, not the old teardrop: this list is what the visitor
                  can expect to happen, so a checkmark says what the shape
                  means. The teardrop was a leftover of the placeholder logo. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="mt-[5px] h-3.5 w-3.5 flex-none text-orange"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5 6.2 12 13 4.5" />
              </svg>
              {line}
            </li>
          ))}
        </ul>

        <RequestForm topic={topic} copy={copy} />

        <div className="mt-12 rounded-card-lg border border-subtle bg-cream-card p-6 sm:p-7">
          <h2 className="mb-2 font-serif text-xl text-ink">{t.otherWaysHeading}</h2>
          <p className="mb-5 text-[14.5px] leading-relaxed text-slate">{t.otherWaysBody}</p>

          <dl className="mb-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-xs font-bold uppercase tracking-[.08em] text-navy">
                {t.addressLabel}
              </dt>
              <dd className="text-[14.5px] leading-relaxed text-slate">{SITE.address}</dd>
            </div>
            <div>
              <dt className="mb-1 text-xs font-bold uppercase tracking-[.08em] text-navy">
                {t.timesLabel}
              </dt>
              <dd className="text-[14.5px] leading-relaxed text-slate">
                {SERVICE_TIMES.map((s) => (
                  <span key={s.en} className="block">
                    {s[lang]} · {serviceRange(s)}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          {/* /connect only: /bible-studies shares this card, and the brief
              places the channels on the Verbind page. */}
          {topic === 'connect' && (
            <div className="mb-5">
              <SocialLinks label={t.followUs} newTab={t.opensNewTab} variant="light" />
            </div>
          )}

          <a
            href={SITE.directionsUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
          >
            {t.directionsCta} →
          </a>
        </div>
      </section>

      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function RequestPage({ topic }: { topic: RequestTopic }) {
  return (
    <LanguageProvider>
      <RequestContent topic={topic} />
    </LanguageProvider>
  );
}
