import { motion } from 'framer-motion';

export default function OriginSection() {
  return (
    <section id="origen" className="relative py-32 px-6 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Header Section */}
        <div className="text-center mb-32">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
            className="text-honey-500 font-sans text-sm mb-6 block"
          >
            Nuestro origen
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-4xl sm:text-6xl font-serif text-forest-950 leading-tight"
          >
            Desde el corazón de <br/> la Cordillera Caucana.
          </motion.h2>
        </div>

        {/* Storytelling Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

          {/* Left Content - The Story */}
          <div className="lg:col-span-5 space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="bg-sand-100 p-8 rounded-2xl border border-sand-200"
            >
              <p className="text-xl font-serif text-forest-950 mb-4 italic">
                "La miel es el reflejo exacto del clima, la flora y el respeto que le tengamos a la colmena."
              </p>
              <p className="text-sand-600 font-sans text-sm">— Maestro Apicultor, Finca Los Colibríes</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="space-y-6 text-sand-500 font-sans leading-relaxed"
            >
              <p>
                A 1.750 metros sobre el nivel del mar, en Santa Elena, Piendamó, el paisaje se funde con la cultura cafetera. Aquí, en los bosques subandinos, las abejas recolectan el néctar de una flora diversa y silvestre.
              </p>
              <p>
                Nuestra cosecha es manual y paciente. No forzamos los tiempos; esperamos a que la miel madure naturalmente en el panal, asegurando una densidad y un perfil aromático inigualable, impregnado de la esencia de la montaña caucana.
              </p>
            </motion.div>
          </div>

          {/* Right Content - Imagery */}
          <div className="lg:col-span-7 relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              viewport={{ once: true }}
              className="relative z-10 rounded-2xl overflow-hidden shadow-xl"
            >
              <img
                src="/assets/apicultor-forest.jpg" // Placeholder
                alt="Apicultor en el bosque"
                className="w-full h-full object-cover"
              />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
