import { useLanguage } from '../../context/LanguageContext';
import type { Lang } from '../../data/site';

type LanguageToggleProps = {
  variant?: 'light' | 'navy';
};

export function LanguageToggle({ variant = 'light' }: LanguageToggleProps) {
  const { lang, setLang } = useLanguage();
  const pick = (l: Lang) => () => setLang(l);

  const isNavy = variant === 'navy';

  /*
   * One orange on both grounds again (C-59), so the selected pill is the
   * handoff's `bg-orange text-white` everywhere and the navy hover is back to
   * the original orange tint.
   */
  const pillClass = (active: boolean) =>
    `h-full inline-flex items-center justify-center px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-bold transition-colors shrink-0 ${
      active
        ? 'bg-orange text-white'
        : isNavy
        ? 'bg-transparent text-orange hover:bg-orange/20'
        : 'bg-transparent text-navy hover:bg-orange/10 hover:text-orange'
    }`;

  return (
    /*
     * aria-pressed on both buttons rather than the fill alone: the selected
     * language was previously signalled only by `bg-orange text-white`, which
     * tells a screen reader nothing and leans on colour to carry state
     * (SC 1.4.1). Same pattern the carousel's pause button already uses. C-41
     */
    <div
      role="group"
      aria-label={lang === 'af' ? 'Taal' : 'Language'}
      /* No overflow-hidden: each pill's border box meets the wrapper's on three
         sides, so clipping cut the focus ring (drawn 2px outside) down to a
         sliver. The pills are square-ended and the wrapper is a pill, so the
         corners are shaped with a radius on the buttons instead. C-40 */
      className={`h-8 inline-flex shrink-0 flex-none items-center rounded-pill border border-orange text-[11px] sm:text-xs font-bold [&>button:first-child]:rounded-l-pill [&>button:last-child]:rounded-r-pill ${
        isNavy ? 'bg-orange/10' : 'bg-orange/5'
      }`}
    >
      <button
        type="button"
        onClick={pick('af')}
        aria-pressed={lang === 'af'}
        lang="af"
        className={pillClass(lang === 'af')}
      >
        AF
      </button>
      <button
        type="button"
        onClick={pick('en')}
        aria-pressed={lang === 'en'}
        lang="en"
        className={pillClass(lang === 'en')}
      >
        EN
      </button>
    </div>
  );
}
