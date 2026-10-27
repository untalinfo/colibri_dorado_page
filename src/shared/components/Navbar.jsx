import { Bell, ShoppingBag } from 'lucide-react';

export default function Navbar({ onOpenNotify, onOpenOrder }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-5">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5 rounded-full bg-forest-900/80 border border-moss-700/40 backdrop-blur-md shadow-xl">
        {/* Brand identity */}
        <a href="#" className="flex items-center gap-3.5 group">
          <div className="w-9 h-9 rounded-full bg-honey-700/30 border border-honey-500/30 flex items-center justify-center text-honey-400 group-hover:border-honey-400 transition-colors">
            <span className="text-base font-serif font-semibold text-honey-300">C</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-serif font-semibold tracking-wide text-sand-50 group-hover:text-honey-300 transition-colors">
              Colibrí <span className="italic font-normal text-honey-300">Dorado</span>
            </span>
            <span className="text-[10px] tracking-widest text-sand-400 uppercase font-sans">
              Santa Elena • Piendamó
            </span>
          </div>
        </a>

        {/* Navigation items */}
        <nav className="hidden md:flex items-center gap-8 text-xs tracking-wider uppercase font-medium text-sand-300">
          <a href="#origen" className="hover:text-honey-300 transition-colors">
            El Bosque
          </a>
          <a href="#proceso" className="hover:text-honey-300 transition-colors">
            Apicultura Viva
          </a>
          <a href="#cosechas" className="hover:text-honey-300 transition-colors">
            Cosechas
          </a>
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenNotify}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium text-sand-200 hover:text-white bg-moss-900/60 hover:bg-moss-800 border border-moss-700/50 transition-colors"
          >
            <Bell className="w-3 h-3 text-honey-400" />
            <span>Alertas de Cosecha</span>
          </button>

          <button
            type="button"
            onClick={onOpenOrder}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 shadow-sm transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Reservar Miel</span>
          </button>
        </div>
      </div>
    </header>
  );
}
