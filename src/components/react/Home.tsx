import { useState } from 'react';
import { LanguageProvider } from '../../context/LanguageContext';
import type { LatestVideo } from '../../lib/latestVideo';
import { buildHomePayload, HOME_PAYLOAD_ID, readJsonScript } from '../../lib/cms/payload';
import type { HomePayload } from '../../lib/cms/types';
import { Header } from './Header';
import { Hero } from './Hero';
import { ServiceTimesStrip } from './ServiceTimesStrip';
import { ThisWeek } from './ThisWeek';
import { AboutCarousel } from './AboutCarousel';
import { BeliefsSummary } from './BeliefsSummary';
import { GetInvolved } from './GetInvolved';
import { Resources } from './Resources';
import { FirstVisit } from './FirstVisit';
import { VisitMap } from './VisitMap';
import { Footer } from './Footer';

export function Home({ latestVideo = null }: { latestVideo?: LatestVideo | null }) {
  // The week and the department heads come from the page's payload, never a
  // prop: Astro would freeze a prop into the island at build, and the Worker
  // re-renders these two sections per request with live content. Reading the
  // same JSON the Worker wrote is what keeps hydration matching (C-70).
  const [cms] = useState<HomePayload>(() => readJsonScript<HomePayload>(HOME_PAYLOAD_ID) ?? buildHomePayload());
  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col font-sans text-ink">
        <Header />
        <a id="top" />
        {/* The landmark starts after the header so the skip link actually skips
            the nav — that is the whole point of it. */}
        <main id="main" className="flex-1">
          <Hero latestVideo={latestVideo} />
          <ServiceTimesStrip />
          <ThisWeek data={cms} />
          <AboutCarousel heads={cms.heads} cdnEnabled={cms.build.imageCdn} />
          <BeliefsSummary />
          <GetInvolved />
          <Resources />
          <FirstVisit />
          <VisitMap />
        </main>
        <Footer />
      </div>
    </LanguageProvider>
  );
}
