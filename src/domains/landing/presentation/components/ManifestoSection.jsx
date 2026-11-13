import { motion } from 'framer-motion';

export default function ManifestoSection() {
  return (
    <section id="proceso" className="relative py-32 px-6 bg-sand-50">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        {/* Editorial Image - The Purest Detail */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          viewport={{ once: true }}
          className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-2xl"
        >
          <img
            src="/assets/honey-macro.jpg" // Placeholder for high-res macro
            alt="Miel pura detalle"
            className="w-full h-full object-cover scale-105 hover:scale-100 transition-transform duration-1000"
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-black/5" />
        </motion.div>

        {/* Editorial Text */}
        <div className="flex flex-col items-start">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            viewport={{ once: true }}
            className="text-honey-500 font-sans text-sm mb-6"
          >
            La esencia del bosque
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-6xl font-serif text-forest-950 leading-tight mb-12"
          >
            Pureza botánica, <br/>
            preservada en crudo.
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            viewport={{ once: true }}
            className="space-y-6 text-lg text-sand-500 font-sans leading-relaxed max-w-xl"
          >
            <p>
              Nuestra miel no es un producto industrial; es el resultado de un diálogo respetuoso entre las abejas y los bosques subandinos de la zona cafetera.
            </p>
            <p>
              Sin filtrar, sin pasteurizar y sin procesos térmicos. Preservamos cada enzima, cada aroma y cada propiedad botánica original, entregando la miel exactamente como la naturaleza la diseñó en el corazón del Cauca.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 1 }}
            viewport={{ once: true }}
            className="mt-12 flex items-center gap-4"
          >
            <div className="w-16 h-px bg-honey-500/40" />
            <span className="font-serif italic text-forest-950 text-sm">Cosecha Limitada</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
