import { MessageCircle, ShieldCheck, Truck, X } from 'lucide-react';
import { useState } from 'react';

export default function OrderDrawer({ isOpen, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const unitPrice = 38000; // COP
  const total = unitPrice * quantity;

  if (!isOpen) return null;

  const handleWhatsAppOrder = (e) => {
    e.preventDefault();
    const text = encodeURIComponent(
      `¡Hola! Quiero hacer un pedido de Miel Colibrí Dorado:\n\n` +
        `• Nombre: ${customerName || 'Cliente'}\n` +
        `• Ciudad de entrega: ${customerCity || 'Por definir'}\n` +
        `• Cantidad: ${quantity} frasco(s) de 500g\n` +
        `• Total estimado: $${total.toLocaleString('es-CO')} COP\n\n` +
        `¿Tienen disponibilidad en este momento para despacho desde Piendamó?`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Accessible Backdrop */}
      <button
        type="button"
        aria-label="Cerrar panel de pedido"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full bg-forest-950/80 backdrop-blur-sm transition-opacity cursor-default border-0"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-forest-900 border-l border-moss-700/60 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto shadow-2xl">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between pb-6 border-b border-moss-700/40">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-xl font-serif font-normal text-sand-50">Reserva de Cosecha</h3>
              </div>
              <button
                type="button"
                aria-label="Cerrar panel"
                onClick={onClose}
                className="text-sand-400 hover:text-sand-100 p-1 rounded-lg hover:bg-forest-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Card */}
            <div className="mt-6 p-4 rounded-2xl bg-forest-950/90 border border-moss-700/60 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl bg-moss-900 border border-moss-700/60 flex items-center justify-center text-3xl shadow-inner shrink-0">
                🍯
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-moss-800 text-honey-300 uppercase tracking-wider font-sans">
                    Lote #04 Santa Elena
                  </span>
                </div>
                <h4 className="text-base font-serif font-medium text-sand-50 leading-snug">
                  Miel Cruda de Montaña (500g)
                </h4>
                <p className="text-xs text-sand-400 mt-0.5 font-sans">
                  Floración nativa y arrayán silvestre
                </p>
                <p className="text-sm font-semibold text-honey-400 mt-2 font-sans">
                  ${unitPrice.toLocaleString('es-CO')} COP
                </p>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-forest-950/50 border border-moss-700/40">
              <span className="text-xs font-medium text-sand-300">Cantidad de frascos:</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Disminuir cantidad"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-lg bg-moss-900 border border-moss-700 text-sand-100 font-bold flex items-center justify-center hover:bg-moss-800 transition-colors"
                >
                  -
                </button>
                <span className="text-sm font-medium text-sand-50 w-6 text-center font-sans">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar cantidad"
                  onClick={() => setQuantity(Math.min(6, quantity + 1))}
                  className="w-8 h-8 rounded-lg bg-moss-900 border border-moss-700 text-sand-100 font-bold flex items-center justify-center hover:bg-moss-800 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Order Form */}
            <form onSubmit={handleWhatsAppOrder} className="mt-6 space-y-4 font-sans">
              <div>
                <label
                  htmlFor="order-name"
                  className="block text-xs font-medium text-sand-300 mb-1.5"
                >
                  Tu nombre
                </label>
                <input
                  id="order-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-moss-700/60 text-sand-50 placeholder-sand-500 text-sm focus:outline-none focus:border-honey-500 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="order-city"
                  className="block text-xs font-medium text-sand-300 mb-1.5"
                >
                  Ciudad o Municipio de destino
                </label>
                <input
                  id="order-city"
                  type="text"
                  required
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  placeholder="Ej. Cali, Popayán, Bogotá, Medellín..."
                  className="w-full px-4 py-2.5 rounded-xl bg-forest-950 border border-moss-700/60 text-sand-50 placeholder-sand-500 text-sm focus:outline-none focus:border-honey-500 transition-colors"
                />
              </div>

              {/* Trust highlights */}
              <div className="pt-2 space-y-2 text-xs text-sand-400">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-moss-700" />
                  <span>Envíos seguros directos desde Piendamó</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-honey-500" />
                  <span>Miel 100% pura certificada por el origen</span>
                </div>
              </div>

              {/* Total & Submit */}
              <div className="pt-6 border-t border-moss-700/40">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-sand-300 font-medium">Total de la cosecha:</span>
                  <span className="text-xl font-serif font-medium text-sand-50">
                    ${total.toLocaleString('es-CO')} COP
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 shadow-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Confirmar Reserva por WhatsApp</span>
                </button>
                <p className="mt-2 text-[11px] text-center text-sand-400 font-sans">
                  Trato directo y cercano con la familia apícola.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
