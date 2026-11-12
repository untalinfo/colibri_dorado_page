import { motion } from 'framer-motion';
import { ArrowRight, Bell } from 'lucide-react';
import SeamlessVideoBackground from '../../../../shared/components/SeamlessVideoBackground';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Hero({ onOpenNotify, onOpenOrder }) {
  return (
    <section className="relative min-h-screen pt-36 pb-20 flex flex-col justify-between overflow-hidden bg-botanical-noise">
      {/* Organic atmospheric depth with dual-buffer seamless video loop */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <SeamlessVideoBackground src="/hero-forest-10s.mp4" />
        <div className="absolute inset-0 bg-forest-950/70" />
      </div>

      {/* Hero Central Content (Left-aligned Editorial Composition) */}
      <motion.div
        className="relative z-20 max-w-6xl mx-auto px-6 sm:px-12 text-left my-auto w-full flex flex-col items-start"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Brand Headline with Fraunces Serif */}
        <motion.h1
          variants={itemVariants}
          className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight text-sand-50 mb-6 leading-[1.02]"
        >
          Colibrí <span className="italic font-normal text-honey-300">Dorado</span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          variants={itemVariants}
          className="text-xl sm:text-2xl md:text-3xl font-serif text-honey-300 mb-4 tracking-normal max-w-2xl font-light"
        >
          Miel cruda de bosque andino. Cosecha limitada.
        </motion.p>

        {/* Provenance Origin Note */}
        <motion.p
          variants={itemVariants}
          className="text-sm sm:text-base font-sans text-sand-400 mb-8 tracking-wide"
        >
          Finca Los Colibríes • Santa Elena, Piendamó (1.750 msnm)
        </motion.p>

        {/* Narrative Context */}
        <motion.p
          variants={itemVariants}
          className="text-base sm:text-lg text-sand-300 max-w-xl font-normal leading-relaxed mb-12 font-sans"
        >
          Cosechada a mano en el corazón de la zona cafetera caucana. Sin someter a calor ni procesos
          industriales, preservando viva la esencia botánica de los bosques subandinos.
        </motion.p>

        {/* Actions */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto"
        >
          {/* Primary CTA */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onOpenOrder}
            className="px-8 py-4 rounded-full font-medium text-sm text-sand-50 bg-honey-700 hover:bg-honey-600 transition-colors flex items-center justify-center gap-2.5"
          >
            <span>Reservar Frasco de Cosecha</span>
            <ArrowRight className="w-4 h-4 text-honey-300" strokeWidth={1.5} />
          </motion.button>

          {/* Secondary Action */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onOpenNotify}
            className="px-7 py-4 rounded-full font-medium text-sm text-sand-300 hover:text-sand-100 bg-forest-900/90 hover:bg-forest-800 transition-colors flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4 text-honey-400" strokeWidth={1.5} />
            <span>Avisarme de Próxima Cosecha</span>
          </motion.button>
        </motion.div>

        {/* Batch Status note */}
        <motion.p variants={itemVariants} className="mt-8 text-sm font-sans text-sand-400">
          Producción artesanal reducida: 23 frascos disponibles del lote actual
        </motion.p>
      </motion.div>

      {/* Provenance Triad (Refined Editorial Composition) */}
      <motion.div
        className="relative z-20 max-w-6xl mx-auto w-full px-6 sm:px-12 pb-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.8 }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 py-4 border-t border-sand-500/10 pt-12">
          <div className="flex flex-col">
            <p className="text-base font-serif font-medium text-sand-100">
              100% Pura y Cruda
            </p>
            <p className="text-sm text-sand-400 font-sans mt-2">
              Sin pasteurizar ni filtrar en caliente
            </p>
          </div>
          <div className="flex flex-col">
            <p className="text-base font-serif font-medium text-sand-100">
              1.750 msnm
            </p>
            <p className="text-sm text-sand-400 font-sans mt-2">Bosque subandino en Piendamó</p>
          </div>
          <div className="flex flex-col">
            <p className="text-base font-serif font-medium text-sand-100">
              Apicultura Respetuosa
            </p>
            <p className="text-sm text-sand-400 font-sans mt-2">
              Tiempo natural de maduración en panal
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
