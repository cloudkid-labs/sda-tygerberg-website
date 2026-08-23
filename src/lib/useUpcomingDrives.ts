import { useEffect, useState } from 'react';
import { BLOOD_DRIVES } from '../data/site';

/** `YYYY-MM-DD` in local time. Not `toISOString()`, which converts to UTC and
 *  rolls the date back for the first two hours of every SAST day. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The drives still to come as at the build, which is what the pre-hydration
 * render shows. Seeding with the whole roster instead made the served HTML
 * name a drive that had already happened — four months past, and 27 sessions
 * where the mounted page says 12. That is the copy a crawler indexes and the
 * only copy a reader without JavaScript ever sees.
 *
 * `__BUILD_DATE__` is a literal, identical in the static HTML and in the
 * bundle, so this stays a constant on both sides of hydration. C-36, C-44
 */
const DRIVES_AT_BUILD = BLOOD_DRIVES.filter((d) => d >= __BUILD_DATE__);

/**
 * The drives still to come, narrowed after mount rather than during render —
 * CONCERNS.md C-36. Shared by the week card and the blood bank page so the two
 * can never disagree about what "upcoming" means, and so the reasoning behind
 * the seed lives in one place instead of two.
 */
export function useUpcomingDrives(): readonly string[] {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(today()), []);
  return now ? BLOOD_DRIVES.filter((d) => d >= now) : DRIVES_AT_BUILD;
}
