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
 * The drives still to come, narrowed after mount rather than during render —
 * CONCERNS.md C-36. Shared by the week card and the blood bank page so the two
 * can never disagree about what "upcoming" means, and so the reasoning behind
 * the null seed lives in one place instead of two.
 */
export function useUpcomingDrives(): readonly string[] {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => setNow(today()), []);
  return now ? BLOOD_DRIVES.filter((d) => d >= now) : BLOOD_DRIVES;
}
