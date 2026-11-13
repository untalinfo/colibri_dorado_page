import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function ClosingSection({ onOpenOrder }) {
  return (
    <section className="relative py-32 px-6 overflow-hidden bg-forest-950">
      {/* No ambient glow - quiet chrome */}
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl sm:text-7xl font-serif text-sand-50 mb-12 leading-tight">
            Asegure su frasco de la <br/>
            <span className="italic text-honey-300">cosecha actual</span>
          </h2>

          <p className="text-xl text-sand-400 font-sans mb-16 max-w-2xl mx-auto leading-relaxed">
            La producción artesanal es limitada por naturaleza. Disponible hasta agotar existencias del lote actual.
          </p>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onOpenOrder}
            className="px-12 py-5 rounded-full font-medium text-lg text-forest-950 bg-honey-500 hover:bg-honey-400 transition-colors flex items-center justify-center gap-3 mx-auto shadow-lg shadow-black/20"
          >
            <span>Reservar Ahora</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>

      {/* Footer minimalist */}
      <footer className="mt-32 pt-12 border-t border-forest-800 max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-8 text-sand-500 text-sm font-sans">
        <div className="font-serif italic text-lg text-sand-100">
          Colibrí Dorado
        </div>
        <div className="flex gap-8">
          <a href="#" className="hover:text-honey-300 transition-colors">Origen</a>
          <a href="#" className="hover:text-honey-300 transition-colors">Pureza</a>
          <a href="#" className="hover:text-honey-300 transition-colors">Contacto</a>
        </div>
        <div className="text-center sm:text-right">
          © 2026 Finca Los Colibríes. <br/>
          Santa Elena, Piendamó, Colombia.
        </div>
      </footer>
    </section>
  );
}
