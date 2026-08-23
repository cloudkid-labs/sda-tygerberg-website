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
   * Two palettes, not one tinted differently: on the cream header the orange
   * is the darkened light-ground value with a white label, and on the navy
   * footers it is the lifted one with a navy-deep label. Both clear 4.5:1 in
   * every state; neither value does on the other ground.
   *
   * The navy hover tint is /10, not /20: at /20 it stacked a third orange layer
   * under orange text and the inactive label fell to 4.21:1. C-39
   */
  const pillClass = (active: boolean) =>
    `h-full inline-flex items-center justify-center px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-bold transition-colors shrink-0 ${
      active
        ? isNavy
          ? 'bg-orange-on-navy text-navy-deep'
          : 'bg-orange text-white'
        : isNavy
        ? 'bg-transparent text-orange-on-navy hover:bg-orange-on-navy/10'
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
      className={`h-8 inline-flex shrink-0 flex-none items-center rounded-pill border text-[11px] sm:text-xs font-bold [&>button:first-child]:rounded-l-pill [&>button:last-child]:rounded-r-pill ${
        isNavy ? 'border-orange-on-navy bg-orange-on-navy/10' : 'border-orange bg-orange/5'
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
