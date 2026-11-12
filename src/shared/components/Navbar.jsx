import { Bell, Menu, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';

// Ordered as the sections appear on the landing page.
const NAV_ITEMS = [
  { href: '#proceso', label: 'El Bosque' },
  { href: '#origen', label: 'Apicultura Viva' },
  { href: '#cosechas', label: 'Cosechas' },
];

export default function Navbar({ onOpenNotify, onOpenOrder }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-5">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-3.5 rounded-full bg-forest-900/80 border border-moss-700/40 backdrop-blur-md shadow-xl">
        {/* Brand identity */}
        <a
          href="#"
          onClick={closeMenu}
          className="flex shrink-0 items-center gap-2.5 sm:gap-3.5 group"
        >
          <div className="w-9 h-9 rounded-full bg-honey-700/30 border border-honey-500/30 flex items-center justify-center text-honey-400 group-hover:border-honey-400 transition-colors">
            <span className="text-base font-serif font-semibold text-honey-300">C</span>
          </div>
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-base font-serif font-semibold tracking-wide text-sand-50 group-hover:text-honey-300 transition-colors">
              Colibrí <span className="italic font-normal text-honey-300">Dorado</span>
            </span>
            <span className="hidden sm:block text-[10px] tracking-widest text-sand-400 uppercase font-sans">
              Santa Elena • Piendamó
            </span>
          </div>
        </a>

        {/* Navigation items */}
        <nav
          aria-label="Principal"
          className="hidden lg:flex items-center gap-8 text-xs tracking-wider uppercase font-medium text-sand-300"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap hover:text-honey-300 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
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
            className="inline-flex items-center gap-2 whitespace-nowrap px-4 sm:px-5 py-2 rounded-full text-xs font-medium text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 shadow-sm transition-colors"
          >
            <ShoppingBag className="hidden sm:block w-3.5 h-3.5" />
            <span>
              Reservar<span className="hidden sm:inline"> Miel</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-full text-sand-200 hover:text-white bg-moss-900/60 hover:bg-moss-800 border border-moss-700/50 transition-colors"
          >
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <nav
          id="mobile-menu"
          aria-label="Principal"
          className="lg:hidden max-w-6xl mx-auto mt-3 p-3 rounded-3xl bg-forest-900/95 border border-moss-700/40 backdrop-blur-md shadow-xl"
        >
          <ul className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={closeMenu}
                  className="block px-4 py-3 rounded-2xl text-sm tracking-wider uppercase font-medium text-sand-200 hover:text-honey-300 hover:bg-moss-900/60 transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="sm:hidden mt-2 pt-2 border-t border-moss-700/40">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  onOpenNotify();
                }}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium text-sand-200 hover:text-white hover:bg-moss-900/60 transition-colors"
              >
                <Bell className="w-4 h-4 text-honey-400" />
                <span>Alertas de Cosecha</span>
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
