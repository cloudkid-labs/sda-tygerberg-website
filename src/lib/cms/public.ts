import type {
  ChurchEvent,
  DepartmentHead,
  HomePayload,
  Page,
  PublicEvent,
  PublicHead,
  PublicPage,
} from './types';
import { isExpired } from './time';

/**
 * The only way CMS content reaches a visitor. Drafts and hidden heads are
 * dropped here and the audit fields (`updatedBy` is a personal address) are
 * stripped, so nothing a page serializes can carry them. C-70
 */

export function publicEvents(events: ChurchEvent[], today: string): PublicEvent[] {
  return events
    .filter((e) => e.status === 'live' && !isExpired(e, today))
    .sort((a, b) => a.order - b.order)
    .map(({ status: _s, updatedBy: _b, updatedAt: _a, ...rest }) => rest);
}

export function publicHeads(heads: DepartmentHead[]): PublicHead[] {
  return heads
    .filter((h): h is DepartmentHead & { photo: { src: string; alt: string } } => h.visible && Boolean(h.photo))
    .sort((a, b) => a.order - b.order)
    .map(({ updatedBy: _b, updatedAt: _a, visible: _v, ...rest }) => rest);
}

export function publicPage(page: Page): PublicPage {
  const { status: _s, updatedBy: _b, updatedAt: _a, ...rest } = page;
  return rest;
}

export function homePayload(
  events: ChurchEvent[],
  heads: DepartmentHead[],
  asOf: string,
  build: HomePayload['build'],
): HomePayload {
  return { asOf, build, events: publicEvents(events, asOf), heads: publicHeads(heads) };
}

/**
 * JSON for an inline `<script type="application/json">`. `<` is escaped so a
 * stray `</script>` in content cannot end the element early; JSON.parse reads
 * the escape back as `<`.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
