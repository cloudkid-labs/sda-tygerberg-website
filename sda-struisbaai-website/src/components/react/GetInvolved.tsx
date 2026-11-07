import { useLanguage } from '../../context/LanguageContext';
import { homeCopy } from '../../data/homeCopy';
import { withBase } from '../../lib/base';

export function GetInvolved() {
  const { lang } = useLanguage();
  const t = homeCopy[lang];

  const cardClass = (tint: boolean) =>
    `rounded-card-lg border p-6.5 flex flex-col justify-between ${
      tint ? 'border-orange/40 bg-orange/15' : 'border-white/15 bg-white/10'
    }`;

  return (
    <section id="betrokke" className="scroll-mt-24 bg-navy py-16 text-white">
      <div className="mx-auto max-w-content px-7">
        <h2 className="mb-10 text-center font-serif text-[34px] font-medium">
          {t.involvedHeading}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] items-start gap-5">
          <div className={cardClass(false)}>
            <div>
              <div className="mb-2.5 font-serif text-xl">{t.connectTitle}</div>
              <p className="mb-4 text-sm leading-relaxed text-blue-pale">{t.connectDesc}</p>
            </div>
            <a
              href={withBase('/connect/')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill border border-white/20 px-4 py-2 text-[13px] font-bold text-white hover:border-white hover:bg-white/10 transition-colors"
            >
              {t.connectCta} →
            </a>
          </div>

          <div className={cardClass(false)}>
            <div>
              <div className="mb-2.5 font-serif text-xl">{t.studyTitle}</div>
              <p className="mb-4 text-sm leading-relaxed text-blue-pale">{t.studyDesc}</p>
            </div>
            <a
              href={withBase('/bible-studies/')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill border border-white/20 px-4 py-2 text-[13px] font-bold text-white hover:border-white hover:bg-white/10 transition-colors"
            >
              {t.studyCta} →
            </a>
          </div>

          <div className={cardClass(false)}>
            <div>
              <div className="mb-2.5 font-serif text-xl">{t.prayerTitle}</div>
              <p className="mb-4 text-sm leading-relaxed text-blue-pale">{t.prayerDesc}</p>
            </div>
            <a
              href={withBase('/connect/')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill border border-white/20 px-4 py-2 text-[13px] font-bold text-white hover:border-white hover:bg-white/10 transition-colors"
            >
              {t.prayerCta} →
            </a>
          </div>

          <div className={cardClass(true)}>
            <div>
              <div className="mb-2.5 font-serif text-xl">{t.giveTitle}</div>
              <p className="mb-4 text-sm leading-relaxed text-blue-pale">{t.giveDesc}</p>
            </div>
            {/* Was an in-card accordion holding the banking details. Giving now
                has its own page, because a second method (Zapper) plus a QR
                code does not fit in a third of a card — and a giving link is
                the kind of thing people want to send to someone else. */}
            <a
              href={withBase('/giving/')}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-orange px-4 py-2 text-[13px] font-bold text-white hover:bg-orange-hover transition-colors"
            >
              {t.giveCta} →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
