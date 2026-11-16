import ClosingSection from '../components/ClosingSection';
import Hero from '../components/Hero';
import ManifestoSection from '../components/ManifestoSection';
import OriginSection from '../components/OriginSection';
import ProductJewelSection from '../components/ProductJewelSection';
import ProductStructuredData from '../components/ProductStructuredData';
import TransitionBridge from '../components/TransitionBridge';

export default function LandingPage({ onOpenNotify, onOpenOrder }) {
  return (
    <main className="flex-1 bg-[#0B140E] transition-colors duration-1000">
      <Hero onOpenNotify={onOpenNotify} onOpenOrder={onOpenOrder} />
      <TransitionBridge />
      <ManifestoSection />
      <OriginSection />
      <ProductJewelSection />
      <ClosingSection onOpenOrder={onOpenOrder} />
      <ProductStructuredData />
    </main>
  );
}
