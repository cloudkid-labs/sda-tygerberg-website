import { LanguageProvider } from '../../context/LanguageContext';
import type { LatestVideo } from '../../lib/latestVideo';
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
          <ThisWeek />
          <AboutCarousel />
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
