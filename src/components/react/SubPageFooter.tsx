import { withBase } from '../../lib/base';
import { Logo } from './Logo';
import { LanguageToggle } from './LanguageToggle';

/** Minimal footer for the standalone pages — the homepage uses Footer.tsx. */
export function SubPageFooter({ backHome }: { backHome: string }) {
  return (
    <footer className="relative overflow-hidden border-t-2 border-orange bg-navy-deep text-blue-pale">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange/15 via-transparent to-orange/10" />
      <div className="relative z-10 mx-auto flex max-w-content-narrow items-center justify-between gap-2 sm:gap-4 px-3 sm:px-7 py-6 sm:py-8">
        <a href={withBase('/')} className="flex items-center gap-2 sm:gap-2.5 shrink min-w-0">
          <Logo size={28} color="var(--color-cream)" />
          <span className="font-serif text-sm sm:text-base text-white truncate">Tygerberg SDA</span>
        </a>
        <a
          href={withBase('/')}
          className="h-8 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill border border-orange bg-orange/10 px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-bold text-orange hover:bg-orange hover:text-white transition-colors"
        >
          {backHome}
        </a>
        <div className="flex shrink-0 items-center justify-end">
          <LanguageToggle variant="navy" />
        </div>
      </div>
    </footer>
  );
}
