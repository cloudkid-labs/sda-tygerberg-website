import { useEffect, useRef, useState } from 'react';
import { withBase } from '../../lib/base';

/**
 * Polls /api/live-status for the LIVE badge. The route exists only under
 * `wrangler dev` or a real deploy; `astro dev` 404s harmlessly, and the loop
 * deliberately keeps going. Every failure resolves to "not live" — the badge is
 * decorative. CONCERNS.md C-17, C-22.
 */

/** One cadence for every case — open, closed, or failed. */
const POLL_INTERVAL_MS = 5 * 60_000;

type LiveStatusResponse = {
  isLive?: boolean;
  watchUrl?: string | null;
};

/**
 * `watchUrl` is the running broadcast, and can be null even while live: the
 * Worker only fills it when the API named a video id. Callers that link
 * somewhere must fall back to the channel themselves.
 */
export type LiveStatus = { isLive: boolean; watchUrl: string | null };

const OFFLINE: LiveStatus = { isLive: false, watchUrl: null };

export function useLiveStatus(enabled: boolean): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(OFFLINE);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || import.meta.env.PUBLIC_HAS_API === 'false') return;

    let cancelled = false;

    const check = async () => {
      try {
        // withBase, so a subpath preview (ASTRO_BASE) asks its own Worker.
        const res = await fetch(withBase('/api/live-status'));
        const data = res.ok ? ((await res.json()) as LiveStatusResponse) : null;
        if (cancelled) return;
        // A non-answer clears the badge too, or a 5xx pins it on — C-17.
        setStatus(
          data?.isLive
            ? { isLive: true, watchUrl: typeof data.watchUrl === 'string' ? data.watchUrl : null }
            : OFFLINE,
        );
      } catch {
        if (cancelled) return;
        setStatus(OFFLINE);
      }

      // Always reschedule: the loop must never terminate — C-17.
      if (!cancelled) timeoutRef.current = setTimeout(check, POLL_INTERVAL_MS);
    };

    void check();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled]);

  return status;
}
