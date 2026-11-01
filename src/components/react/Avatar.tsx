import { useState } from 'react';
import { cdnImageUrl, headshotFallbackFor } from '../../lib/cdnImage';

/**
 * A round profile picture: a department head's headshot or an uploaded
 * profile photo, cropped to the face (top-weighted, like the HOD cards). No
 * photo shows the same tan stripes a department head without a photo shows in
 * the editor — the site's "blank headshot".
 */
export function Avatar({ src, size = 32, alt = '' }: { src: string | null | undefined; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className="inline-block shrink-0 rounded-full border border-tan-border"
        style={{ ...box, backgroundImage: 'repeating-linear-gradient(45deg, var(--color-tan) 0 6px, var(--color-tan-border) 6px 12px)' }}
      />
    );
  }
  // Headshots go through the image CDN like everywhere else; a profile upload
  // is already small and served as is.
  const isHead = src.startsWith('/media/heads/') || src.startsWith('/images/');
  return (
    <img
      src={isHead ? (failed ? headshotFallbackFor(src) : cdnImageUrl(src, 160)) : src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="inline-block shrink-0 rounded-full border border-tan-border bg-tan object-cover object-top"
      style={box}
    />
  );
}
