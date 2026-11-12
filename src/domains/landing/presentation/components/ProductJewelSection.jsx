import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export default function ProductJewelSection() {
  return (
    <section id="cosechas" className="relative py-32 px-6 bg-sand-50">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        {/* Product Image - The Jewel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2 }}
          viewport={{ once: true }}
          className="relative"
        >
          <img
            src="/assets/honey-bottle-luxury.jpg" // Placeholder
            alt="Frasco de Miel Colibrí Dorado"
            className="relative z-10 w-full h-auto drop-shadow-2xl"
          />
        </motion.div>

        {/* Product Details */}
        <div className="flex flex-col items-start">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
            className="text-honey-500 font-sans text-sm mb-6"
          >
            La obra maestra
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-6xl font-serif text-forest-950 leading-tight mb-12"
          >
            Cosecha <br/>
            Limitada 2026
          </motion.h2>

          {/* Luxury Specs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full mb-12">
            {[
              { label: 'Pureza', value: '100% Cruda' },
              { label: 'Origen', value: 'Zona Cafetera' },
              { label: 'Altitud', value: '1.750 msnm' },
              { label: 'Lote', value: 'Edición Limitada' },
            ].map((spec, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + (i * 0.1) }}
                viewport={{ once: true }}
                className="flex items-start gap-3"
              >
                <CheckCircle2 className="w-4 h-4 text-honey-500 mt-1" strokeWidth={1.5} />
                <div>
                  <p className="text-xs text-sand-400 font-sans">{spec.label}</p>
                  <p className="text-lg font-serif text-forest-950">{spec.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            viewport={{ once: true }}
            className="w-full p-6 rounded-2xl bg-white border border-sand-200 shadow-sm"
          >
            <p className="text-sand-500 font-sans text-sm leading-relaxed">
              Cada frasco es numerado manualmente, asegurando que usted posea una pieza única de la biodiversidad andina.
              Cosechada en el ecosistema subandino del Cauca.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
