import { useEffect, useRef, useState } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { BANKING_DETAILS, ZAPPER, givingCopy } from '../../data/giving';
import { withBase } from '../../lib/base';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

/**
 * The account number is the one value someone has to transcribe exactly, and
 * mistyping it is the whole failure mode of EFT giving. Falls back to selecting
 * the text where the clipboard API is unavailable or refused.
 */
function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context, denied permission, or an old browser. Say nothing —
      // the number is on screen and can still be read.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-pill border border-navy/25 px-3 py-1.5 text-[12px] font-bold text-navy transition-colors hover:border-navy hover:bg-navy hover:text-white"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

function GivingContent() {
  const { lang } = useLanguage();
  const t = givingCopy[lang];

  // Either half is enough to be useful, and they are independent: today the
  // church has a scannable code but no linkable payment URL. See data/giving.ts
  // for why the button is absent rather than pointed at the QR's own payload.
  const hasQr = Boolean(ZAPPER.qr);
  const hasLink = Boolean(ZAPPER.url);
  const hasZapper = hasQr || hasLink;

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[780px] px-7 pb-8 pt-16 text-center">
          <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">
            {t.eyebrow}
          </div>
          <h1 className="mb-4 text-balance font-serif text-[clamp(30px,5vw,44px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
            {t.heading}
          </h1>
          <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
          <p className="mx-auto max-w-[600px] text-[16.5px] leading-relaxed text-slate">{t.sub}</p>
        </section>

        <section className="mx-auto max-w-[780px] px-7 pb-16">
          {/* One column until there is genuinely room for two, so the cards
              never end up as a pair of narrow strips on a tablet. */}
          <div
            className={`grid gap-5 ${hasZapper ? 'md:grid-cols-2' : 'mx-auto max-w-[420px]'}`}
          >
            <div className="rounded-card-lg border border-subtle bg-white p-6 text-left">
              <div className="mb-3 text-xs font-bold uppercase tracking-[.08em] text-orange">
                {t.accountDetailsLabel}
              </div>
              <div className="mb-4 font-serif text-lg leading-snug text-navy">
                {BANKING_DETAILS.organisation}
              </div>
              <dl className="mb-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[14.5px] leading-relaxed">
                <dt className="text-slate-muted">{t.bankLabel}</dt>
                <dd className="text-ink">{BANKING_DETAILS.bank}</dd>
                <dt className="text-slate-muted">{t.accountNumberLabel}</dt>
                {/* Tabular figures so the digits line up and are easier to read
                    back against a banking app. */}
                <dd className="font-bold tabular-nums text-ink">{BANKING_DETAILS.accountNumber}</dd>
                <dt className="text-slate-muted">{t.branchCodeLabel}</dt>
                <dd className="tabular-nums text-ink">{BANKING_DETAILS.branchCode}</dd>
                <dt className="text-slate-muted">{t.referenceLabel}</dt>
                <dd className="text-ink">{t.referenceNote}</dd>
              </dl>
              <CopyButton
                value={BANKING_DETAILS.accountNumber}
                label={t.copyLabel}
                copiedLabel={t.copiedLabel}
              />
            </div>

            {hasZapper && (
              <div className="rounded-card-lg border border-orange/40 bg-orange/10 p-6 text-left">
                <div className="mb-3 text-xs font-bold uppercase tracking-[.08em] text-orange">
                  {t.zapperTitle}
                </div>
                <p className="mb-4 text-[14.5px] leading-relaxed text-slate">{t.zapperDesc}</p>

                {/* A plain link, deliberately. Zapper publishes the iOS and
                    Android deep-link manifests for zapper.com, so a zapper.com
                    link opens the app when installed and the web page when not
                    — no JavaScript, no custom scheme, no user-agent sniffing.
                    Absent today: the church's code is on the older 2.zap.pe
                    domain, which those manifests do not cover. */}
                {hasLink && (
                  <a
                    href={ZAPPER.url}
                    className="inline-flex items-center justify-center gap-1.5 rounded-pill bg-orange px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-orange-hover"
                  >
                    {t.zapperCta} →
                  </a>
                )}

                {hasQr && (
                  <div className={hasLink ? 'mt-5' : ''}>
                    <div className="mb-2.5 text-[13px] text-slate-muted">
                      {hasLink ? t.zapperScan : t.zapperScanOnly}
                    </div>
                    {/* The QR is for a *second* device's camera — a phone
                        cannot scan the screen it is displayed on — so it sits
                        below the button rather than replacing it.

                        Fills the card rather than sitting at a fixed 200px in
                        the corner of it: a code that is physically bigger on
                        screen is a code another phone can scan from further
                        away and at a worse angle. Capped so it stays square
                        with the card's padding, and centred for the same
                        reason the card is not all left-rag. The source is
                        960px, so even the 320px cap is 3x on a retina screen. */}
                    <img
                      src={withBase(`/images/${ZAPPER.qr}`)}
                      alt={t.zapperQrAlt}
                      width={320}
                      height={320}
                      loading="lazy"
                      className="mx-auto h-auto w-full max-w-[320px] rounded-card bg-white p-3"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-[14.5px] text-slate-muted">{t.thanks}</p>
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function GivingPage() {
  return (
    <LanguageProvider>
      <GivingContent />
    </LanguageProvider>
  );
}
