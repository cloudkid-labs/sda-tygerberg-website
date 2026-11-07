import { renderToString } from 'react-dom/server';
import { LanguageProvider } from '../context/LanguageContext';
import { ThisWeek } from '../components/react/ThisWeek';
import { EventPages } from '../components/react/EventPages';
import { AboutCarousel } from '../components/react/AboutCarousel';
import { FEATURE_FLAGS } from '../data/featureFlags';
import { CmsPageView } from '../components/react/CmsPageView';
import type { HomePayload, PublicPage } from '../lib/cms/types';

/**
 * The Worker's half of hydration (C-70). Each function renders the same
 * component, with the same props, that the island renders on its first pass
 * in the browser — so the HTML the Worker writes is the HTML React expects
 * to find. Afrikaans, because every island starts in Afrikaans and swaps after
 * mount. scripts/check-cms-render.mjs asserts after every build that these
 * match what Astro rendered for the seed.
 */

/**
 * React 19 hoists resource hints for eager images to the front of its output
 * as `<link rel="preload">`. Astro's island render drops them, so the built
 * page has none — and neither may the section the Worker splices in, or the
 * markup no longer matches. They are hints only; nothing else is lost.
 */
function withoutHoistedHints(html: string): string {
  return html.replace(/^(?:<link\b[^>]*>)+/, '');
}

export function renderWeekSection(payload: HomePayload): string {
  return withoutHoistedHints(renderToString(
    <LanguageProvider>
      <ThisWeek data={payload} />
    </LanguageProvider>,
  ));
}

export function renderEventsSection(payload: HomePayload): string {
  return withoutHoistedHints(renderToString(
    <LanguageProvider>
      <EventPages data={payload} />
    </LanguageProvider>,
  ));
}

export function renderAboutSection(payload: HomePayload): string {
  if (!FEATURE_FLAGS.departmentHeads) return '<section id="oor" hidden aria-hidden="true"></section>';
  return withoutHoistedHints(renderToString(
    <LanguageProvider>
      <AboutCarousel heads={payload.heads} cdnEnabled={payload.build.imageCdn} />
    </LanguageProvider>,
  ));
}

export function renderPageRoot(page: PublicPage): string {
  return withoutHoistedHints(renderToString(<CmsPageView page={page} />));
}
