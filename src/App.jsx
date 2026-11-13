import { useMemo, useState } from 'react';
import LandingPage from './domains/landing/presentation/pages/LandingPage';
import HarvestNotificationModal from './domains/notifications/presentation/components/HarvestNotificationModal';
import { createSupabaseOrdersRepository } from './domains/orders/infrastructure/supabaseOrdersRepository';
import OrderDrawer from './domains/orders/presentation/components/OrderDrawer';
import LotProvider from './domains/orders/presentation/LotProvider';
import Navbar from './shared/components/Navbar';
import { getReservationsConfig } from './shared/lib/supabase';

export default function App() {
  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  // Null config (flag off or env missing) means no provider: the site works without a backend.
  const repository = useMemo(() => {
    const config = getReservationsConfig();
    return config ? createSupabaseOrdersRepository(config) : null;
  }, []);

  const page = (
    <>
      {/* Top Navigation */}
      <Navbar onOpenNotify={() => setIsNotifyOpen(true)} onOpenOrder={() => setIsOrderOpen(true)} />

      {/* Pages orchestrator */}
      <LandingPage
        onOpenNotify={() => setIsNotifyOpen(true)}
        onOpenOrder={() => setIsOrderOpen(true)}
      />

      {/* Harvest Notification Modal (Subscribers) */}
      <HarvestNotificationModal isOpen={isNotifyOpen} onClose={() => setIsNotifyOpen(false)} />

      {/* Interactive Order Drawer */}
      <OrderDrawer isOpen={isOrderOpen} onClose={() => setIsOrderOpen(false)} />
    </>
  );

  return (
    <div className="min-h-screen text-stone-100 flex flex-col selection:bg-honey-500 selection:text-forest-950">
      {repository ? <LotProvider repository={repository}>{page}</LotProvider> : page}
    </div>
  );
}
