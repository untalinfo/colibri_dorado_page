import Hero from '../components/Hero';
import SourceSection from '../components/SourceSection';

export default function LandingPage({ onOpenNotify, onOpenOrder }) {
  return (
    <main className="flex-1">
      <Hero onOpenNotify={onOpenNotify} onOpenOrder={onOpenOrder} />
      <SourceSection />
    </main>
  );
}
