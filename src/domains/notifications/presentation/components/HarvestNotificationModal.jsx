import { Bell, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';

export default function HarvestNotificationModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    setEmail('');
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Accessible Backdrop */}
      <button
        type="button"
        aria-label="Cerrar modal"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full bg-forest-950/80 backdrop-blur-sm transition-opacity cursor-default border-0"
        onClick={handleReset}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-forest-900 border border-moss-700/60 shadow-2xl z-10 overflow-hidden text-left">
        <button
          type="button"
          aria-label="Cerrar ventana"
          onClick={handleReset}
          className="absolute top-5 right-5 text-sand-400 hover:text-sand-100 transition-colors p-1 rounded-lg hover:bg-forest-800"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <div>
            <div className="w-10 h-10 rounded-full bg-moss-800/80 border border-moss-700/60 flex items-center justify-center text-honey-400 mb-5">
              <Bell className="w-4 h-4" />
            </div>

            <h3 className="text-2xl font-serif text-sand-50 mb-2 font-normal">
              Alertas de Cosecha
            </h3>

            <p className="text-sm text-sand-300 leading-relaxed mb-6 font-sans">
              Las abejas en la Finca Los Colibríes trabajan con los ciclos de floración de la
              cordillera. Dejanos tu correo para recibir un aviso respetuoso cuando un nuevo lote
              esté listo para envasar.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="notify-name"
                  className="block text-xs font-sans text-sand-300 mb-1.5"
                >
                  Nombre completo
                </label>
                <input
                  id="notify-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Camila Morales"
                  className="w-full px-4 py-3 rounded-xl bg-forest-950 border border-moss-700/60 text-sand-50 placeholder-sand-500 text-sm focus:outline-none focus:border-honey-500 transition-colors font-sans"
                />
              </div>

              <div>
                <label
                  htmlFor="notify-email"
                  className="block text-xs font-sans text-sand-300 mb-1.5"
                >
                  Correo electrónico
                </label>
                <input
                  id="notify-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="camila@ejemplo.com"
                  className="w-full px-4 py-3 rounded-xl bg-forest-950 border border-moss-700/60 text-sand-50 placeholder-sand-500 text-sm focus:outline-none focus:border-honey-500 transition-colors font-sans"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-6 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 border border-honey-600 shadow-sm transition-colors"
              >
                Suscribirme a las Alertas
              </button>
            </form>

            <p className="mt-4 text-[11px] text-sand-400 text-center font-sans">
              Cero spam. Solo un aviso directo cuando el frasco esté listo.
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-moss-800/80 border border-moss-700 text-honey-400 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-2xl font-serif text-sand-50 mb-2 font-normal">
              ¡Quedaste en la lista, {name}!
            </h3>

            <p className="text-sm text-sand-300 mb-6 font-sans">
              Te avisaremos en cuanto la próxima cosecha de montaña esté lista en la Finca Los
              Colibríes.
            </p>

            <button
              type="button"
              onClick={handleReset}
              className="py-2 px-6 rounded-full text-xs font-medium text-sand-200 bg-forest-800 hover:bg-forest-700 border border-moss-700/60 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
