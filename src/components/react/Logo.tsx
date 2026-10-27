import { withBase } from '../../lib/base';

type LogoProps = {
  size?: number;
};

/**
 * The church lockup: the SDA mark in a navy disc with a TYGERBERG SDA
 * wordmark on cream (`public/oauth-logo.png`, committed). Rendered as an
 * image with app-icon rounding so the cream tile sits cleanly on navy
 * footers as well as cream headers.
 *
 * Board-approved exception to C-25 (Oct 2026): the header/footer identity is
 * this lockup, not the bare symbol. The symbol file itself stays untouched.
 */
export function Logo({ size = 38 }: LogoProps) {
  return (
    <img
      src={withBase('/oauth-logo.png')}
      width={size}
      height={size}
      alt="Tygerberg SDA Kerk"
      className="flex-none rounded-[22%] object-cover"
      style={{ width: size, height: size }}
    />
  );
}
