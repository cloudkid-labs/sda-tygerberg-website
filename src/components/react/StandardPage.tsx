import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { pageCopy } from '../../data/pageCopy';
import { requestTopics } from '../../data/requestCopy';
import type { Lang } from '../../data/site';
import type { Block, L10n, TimeSlotsBlock } from '../../lib/cms/types';
import { withBase } from '../../lib/base';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';
import { RequestForm } from './RequestForm';

/**
 * The one layout every CMS page uses (Template artboard), and /blood-bank
 * with it: the fixed sub-page header, a page header (eyebrow, title, blue
 * divider, intro), the blocks in order, the fixed footer. Content changes;
 * header, footer, type and spacing do not. C-70
 */

export type StandardPageHeader = { eyebrow: L10n; title: L10n; intro: L10n };

function Paragraphs({ text, className }: { text: string; className: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={className}>
            {p}
          </p>
        ))}
    </>
  );
}

function TimeSlotsItem({ block, lang }: { block: TimeSlotsBlock; lang: Lang }) {
  const c = pageCopy[lang];
  return (
    <li className="rounded-card border border-subtle border-t-2 border-t-orange bg-cream-card p-5 shadow-card sm:p-6">
      <div className="mb-1 text-xs font-bold uppercase tracking-[.08em] text-orange">{block.day[lang]}</div>
      <div className="mb-4 font-serif text-xl text-ink">{block.title[lang]}</div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-slate-muted">{c.slotsLabel}</div>
      <ul className="flex flex-wrap gap-2">
        {block.slots.map((slot) => (
          <li
            key={slot}
            className="rounded-pill border border-subtle bg-white px-3.5 py-1.5 text-[13px] font-bold text-slate"
          >
            {slot}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The enquiry form, mounted after hydration. Whether it shows a Turnstile
 * widget is a build flag the Worker cannot see, so neither the build nor the
 * Worker renders the form itself — both render this placeholder, and the
 * browser swaps the form in. Delivery is the topic's, never page content's.
 */
function ContactForm({ topic, lang }: { topic: 'connect' | 'bible-study'; lang: Lang }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="min-h-[420px] rounded-card-lg border border-subtle bg-tan/40 p-7 text-[14px] text-slate-muted">
        {pageCopy[lang].formLoading}
      </div>
    );
  }
  return <RequestForm topic={topic} copy={requestTopics[topic][lang]} />;
}

export function BlockView({ block, lang }: { block: Block; lang: Lang }) {
  const c = pageCopy[lang];
  switch (block.type) {
    case 'infoCard':
      return (
        <div className="rounded-card-lg border border-subtle border-t-2 border-t-orange bg-cream-card p-7 shadow-card">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-[.08em] text-orange">{block.label[lang]}</div>
          <div className="mb-5 font-serif text-[28px] leading-tight text-ink">{block.big[lang]}</div>
          {block.where[lang] && (
            <>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[.12em] text-slate-muted">{c.whereLabel}</div>
              <div className="text-[14.5px] leading-relaxed">{block.where[lang]}</div>
            </>
          )}
          {block.note[lang] && <p className="mt-5 text-[13.5px] font-bold text-slate">{block.note[lang]}</p>}
        </div>
      );
    case 'cardGrid':
      return (
        <div>
          {block.heading[lang] && <h2 className="mb-2 font-serif text-[28px] font-medium text-ink">{block.heading[lang]}</h2>}
          {block.intro[lang] && <p className="mb-6 text-[15.5px] leading-relaxed text-slate">{block.intro[lang]}</p>}
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
            {block.cards.map((card, i) => (
              <li key={i} className="rounded-card border border-subtle bg-cream-card p-5">
                {card.label[lang] && (
                  <div className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-orange">{card.label[lang]}</div>
                )}
                <div className="mb-1.5 font-serif text-xl text-ink">{card.title[lang]}</div>
                {card.text[lang] && <p className="text-[13.5px] leading-relaxed text-slate">{card.text[lang]}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'timeSlots':
      return (
        <ul className="grid gap-4">
          <TimeSlotsItem block={block} lang={lang} />
        </ul>
      );
    case 'text':
      return (
        <div>
          {block.heading[lang] && <h2 className="mb-2.5 font-serif text-[28px] font-medium text-ink">{block.heading[lang]}</h2>}
          <div className="grid gap-3">
            <Paragraphs text={block.body[lang]} className="text-[15.5px] leading-[1.7] text-slate" />
          </div>
        </div>
      );
    case 'faq':
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
          {block.items.map((item, i) => (
            <div key={i} className="rounded-card border border-subtle bg-cream-card p-5">
              <h3 className="mb-1.5 font-serif text-xl font-normal text-ink">{item.q[lang]}</h3>
              <div className="grid gap-2">
                <Paragraphs text={item.a[lang]} className="text-[15px] leading-relaxed text-slate" />
              </div>
            </div>
          ))}
        </div>
      );
    case 'image':
      return (
        <figure>
          <picture>
            <source type="image/webp" srcSet={withBase(block.src.replace(/\.jpg$/, '.webp'))} />
            <img
              src={withBase(block.src)}
              alt={block.alt[lang]}
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className="aspect-video h-auto w-full rounded-card-lg bg-tan object-cover"
            />
          </picture>
          {block.caption[lang] && (
            <figcaption className="mt-2.5 text-center text-[13px] text-slate-muted">{block.caption[lang]}</figcaption>
          )}
        </figure>
      );
    case 'contactForm':
      return <ContactForm topic={block.topic} lang={lang} />;
    case 'callout':
      return (
        <div className="rounded-card-lg border border-orange/40 bg-orange/10 p-7">
          <h2 className="mb-2 font-serif text-xl font-medium text-navy">{block.heading[lang]}</h2>
          {block.text[lang] && <p className="mb-5 text-[14.5px] leading-relaxed text-slate">{block.text[lang]}</p>}
          {block.button && (
            <a
              href={block.button.href.startsWith('/') ? withBase(block.button.href) : block.button.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-orange px-5 text-[13.5px] font-bold text-ink transition-colors hover:bg-orange-hover"
            >
              {block.button.label[lang]} <span aria-hidden="true">→</span>
            </a>
          )}
        </div>
      );
  }
}

/**
 * Consecutive time-slot blocks read as one list — a roster of dates, the
 * way /blood-bank has always shown them — rather than as separate sections.
 */
function groupBlocks(blocks: Block[]): (Block | TimeSlotsBlock[])[] {
  const out: (Block | TimeSlotsBlock[])[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.type === 'timeSlots' && Array.isArray(last)) last.push(block);
    else out.push(block.type === 'timeSlots' ? [block] : block);
  }
  return out;
}

export function StandardPageBody({
  header,
  blocks,
  lang,
  children,
}: {
  header: StandardPageHeader;
  blocks: Block[];
  lang: Lang;
  /** Rendered after the blocks — for a page with something the library has no block for. */
  children?: ReactNode;
}) {
  return (
    <>
      <section className="mx-auto max-w-[720px] px-5 pb-10 pt-14 text-center sm:px-7 sm:pt-16">
        {header.eyebrow[lang] && (
          <div className="mb-4.5 text-xs font-bold uppercase tracking-[.16em] text-orange">{header.eyebrow[lang]}</div>
        )}
        <h1 className="mb-4 text-balance font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
          {header.title[lang]}
        </h1>
        <div className="mx-auto mb-5 h-[3px] w-14 rounded bg-blue-muted" />
        {header.intro[lang] && <p className="mx-auto max-w-[560px] text-[16.5px] leading-relaxed text-slate">{header.intro[lang]}</p>}
      </section>

      <section className="mx-auto flex max-w-[720px] flex-col gap-12 px-5 pb-16 sm:px-7">
        {groupBlocks(blocks).map((item, i) =>
          Array.isArray(item) ? (
            <ul key={i} className="grid gap-4">
              {item.map((block, j) => (
                <TimeSlotsItem key={j} block={block} lang={lang} />
              ))}
            </ul>
          ) : (
            <Fragment key={i}>
              <BlockView block={item} lang={lang} />
            </Fragment>
          ),
        )}
        {children}
      </section>
    </>
  );
}

/** The whole page: chrome, header, blocks. Must sit inside a LanguageProvider. */
export function StandardPage({
  header,
  blocks,
  rootId,
  children,
}: {
  header: StandardPageHeader;
  blocks: Block[];
  rootId?: string;
  children?: ReactNode;
}) {
  const { lang } = useLanguage();
  const c = pageCopy[lang];
  return (
    <div id={rootId} className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={c.backHome} />
      <main id="main" className="flex-1">
        <StandardPageBody header={header} blocks={blocks} lang={lang}>
          {children}
        </StandardPageBody>
      </main>
      <SubPageFooter backHome={c.backHome} />
    </div>
  );
}
