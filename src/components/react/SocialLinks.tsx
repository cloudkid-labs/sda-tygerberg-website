import { SOCIAL_LINKS } from '../../data/site';

/**
 * "Volg ons" and the three channel pills. Text pills, not logos — a platform's
 * mark comes from its own brand kit or not at all. Every URL comes from
 * `SOCIAL_LINKS`, so the footer and /connect cannot disagree.
 *
 * `navy` sits on the dark footer; `light` on a cream card. Both give a 44px
 * target.
 */
export function SocialLinks({
  label,
  newTab,
  variant,
}: {
  label: string;
  /** Screen-reader suffix, "(opens in a new tab)". */
  newTab: string;
  variant: 'navy' | 'light';
}) {
  const labelClass =
    variant === 'navy'
      ? 'mb-2 text-xs font-bold uppercase tracking-[.08em] text-blue-muted'
      : 'mb-2 text-xs font-bold uppercase tracking-[.08em] text-navy';
  const pillClass =
    variant === 'navy'
      ? 'border-white/20 text-blue-pale hover:border-white hover:bg-white/10'
      : 'border-navy/25 text-navy hover:border-navy hover:bg-navy/5';

  return (
    <div>
      <div className={labelClass}>{label}</div>
      <ul className="flex flex-wrap gap-2">
        {SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener"
              className={`inline-flex min-h-11 items-center gap-1 rounded-pill border px-3.5 text-[13px] font-semibold transition-colors ${pillClass}`}
            >
              {link.label}
              <span aria-hidden="true">↗</span>
              <span className="sr-only"> {newTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
