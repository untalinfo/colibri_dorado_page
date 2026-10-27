import Hero from '../components/Hero';
import SourceSection from '../components/SourceSection';
import BeeJourney from '../components/BeeJourney';

export default function LandingPage({ onOpenNotify, onOpenOrder }) {
  return (
    <main className="flex-1">
      <Hero onOpenNotify={onOpenNotify} onOpenOrder={onOpenOrder} />
      <BeeJourney />
      <SourceSection />
    </main>
  );
}
