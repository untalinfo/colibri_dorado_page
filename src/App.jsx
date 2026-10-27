import { useState } from 'react';
import Hero from './domains/landing/presentation/components/Hero';
import HarvestNotificationModal from './domains/notifications/presentation/components/HarvestNotificationModal';
import OrderDrawer from './domains/orders/presentation/components/OrderDrawer';
import Navbar from './shared/components/Navbar';

export default function App() {
  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#070e0a] text-stone-100 flex flex-col selection:bg-honey-500 selection:text-forest-950">
      {/* Top Navigation */}
      <Navbar onOpenNotify={() => setIsNotifyOpen(true)} onOpenOrder={() => setIsOrderOpen(true)} />

      {/* Hero Section */}
      <main className="flex-1">
        <Hero onOpenNotify={() => setIsNotifyOpen(true)} onOpenOrder={() => setIsOrderOpen(true)} />
      </main>

      {/* Harvest Notification Modal (Subscribers) */}
      <HarvestNotificationModal isOpen={isNotifyOpen} onClose={() => setIsNotifyOpen(false)} />

      {/* Interactive Order Drawer */}
      <OrderDrawer isOpen={isOrderOpen} onClose={() => setIsOrderOpen(false)} />
    </div>
  );
}
