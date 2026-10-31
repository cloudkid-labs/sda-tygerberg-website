/**
 * Calendar date in Africa/Johannesburg, `YYYY-MM-DD`. Not `toISOString()`,
 * which is UTC and rolls the date back for the first two hours of every SAST
 * day. Pure: the clock is passed in, so tests can fix it.
 */
export function johannesburgDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A once-off event shows through its own date and disappears the day after. */
export function isExpired(event: { kind: string; date?: string }, today: string): boolean {
  return event.kind === 'once' && typeof event.date === 'string' && event.date < today;
}

/** "19:00 – 20:00", the way the midweek times already read. */
export function timeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}
