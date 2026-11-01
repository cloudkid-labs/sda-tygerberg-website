import type { ReactNode } from 'react';
import { withBase } from '../../lib/base';
import { Logo } from './Logo';
import { LanguageToggle } from './LanguageToggle';

/**
 * Sticky header for the standalone pages. They are separate documents, so the
 * only navigation they need is back home. `backHome` is passed in because each
 * page keeps its own bilingual copy file. `account` is the members area's
 * signed-in badge, beside the language toggle.
 */
export function SubPageHeader({ backHome, account }: { backHome: string; account?: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 border-b border-subtle bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-content-narrow items-center justify-between gap-2 sm:gap-4 px-3 sm:px-7 py-2.5 sm:py-3.5">
        <a href={withBase('/')} className="flex items-center gap-2 sm:gap-3 shrink min-w-0">
          <Logo size={42} />
          <div className="leading-tight min-w-0">
            <div className="font-serif text-xl sm:text-2xl font-semibold leading-tight text-navy truncate">Tygerberg</div>
            <div className="hidden min-[400px]:block text-[10px] uppercase tracking-[.14em] text-slate-muted">
              SDA Kerk · Kaapstad
            </div>
          </div>
        </a>
        <a
          href={withBase('/')}
          className="h-8 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill border border-orange bg-orange/5 px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-bold text-navy hover:bg-orange hover:text-white transition-colors"
        >
          {backHome}
        </a>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {account}
          <LanguageToggle variant="light" />
        </div>
      </div>
    </header>
  );
}
