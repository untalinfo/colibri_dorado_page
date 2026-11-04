import Hero from '../components/Hero';

export default function LandingPage({ onOpenNotify, onOpenOrder }) {
  return (
    <main className="flex-1">
      <Hero onOpenNotify={onOpenNotify} onOpenOrder={onOpenOrder} />
    </main>
  );
}
