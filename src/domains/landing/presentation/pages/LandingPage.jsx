import Hero from '../components/Hero';
import TransitionBridge from '../components/TransitionBridge';
import ManifestoSection from '../components/ManifestoSection';
import OriginSection from '../components/OriginSection';
import ProductJewelSection from '../components/ProductJewelSection';
import ClosingSection from '../components/ClosingSection';

export default function LandingPage({ onOpenNotify, onOpenOrder }) {
  return (
    <main className="flex-1 bg-[#0B140E] transition-colors duration-1000">
      <Hero onOpenNotify={onOpenNotify} onOpenOrder={onOpenOrder} />
      <TransitionBridge />
      <ManifestoSection />
      <OriginSection />
      <ProductJewelSection />
      <ClosingSection onOpenOrder={onOpenOrder} />
    </main>
  );
}



