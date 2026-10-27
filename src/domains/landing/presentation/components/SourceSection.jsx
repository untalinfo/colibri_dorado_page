import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

export default function SourceSection() {
  const targetRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <section
      ref={targetRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-forest-950 py-24"
    >
      {/* Background Parallax Element */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 z-0 opacity-40"
      >
        {/*
          Placeholder for a high-res image of the Andean Cloud Forest.
          In a real $2000 project, this would be a carefully shot atmospheric image.
        */}
        <div className="w-full h-full bg-[url('/hero-forest.mp4')] bg-cover bg-center grayscale contrast-125 brightness-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950 via-transparent to-forest-950" />
      </motion.div>

      <motion.div
        style={{ opacity }}
        className="relative z-10 max-w-5xl mx-auto px-6 sm:px-12 grid grid-cols-1 md:grid-cols-2 gap-16 items-center"
      >
        <div className="flex flex-col items-start">
          <motion.span
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-honey-400 font-serif italic text-lg mb-4"
          >
            El Origen
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl sm:text-5xl md:text-6xl font-serif text-sand-50 mb-6 leading-tight"
          >
            Donde la niebla <br />
            <span className="italic text-honey-300">se vuelve miel</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg text-sand-300 font-sans leading-relaxed mb-8"
          >
            A 1.750 metros sobre el nivel del mar, en el corazón de Santa Elena,
            Piendamó, el bosque de niebla crea un ecosistema único. Aquí, las abejas
            recolectan el néctar de flores silvestres que solo existen en estas
            alturas, resultando en una miel con una complejidad botánica inigualable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.6 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-forest-900/40 border border-forest-800 backdrop-blur-sm"
          >
            <div className="w-12 h-12 rounded-full bg-honey-700/20 flex items-center justify-center text-honey-400 font-serif text-xl">
              🏔️
            </div>
            <div>
              <p className="text-sm font-medium text-sand-100">Cordillera Caucana</p>
              <p className="text-xs text-sand-400">Ecosistema de alta montaña</p>
            </div>
          </motion.div>
        </div>

        {/* Visual Element: An "Editorial" Frame */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="relative group"
        >
          <div className="absolute -inset-4 border border-honey-700/30 rounded-lg transition-all group-hover:inset-0 duration-500" />
          <div className="relative aspect-[4/5] w-full bg-stone-800 rounded-lg overflow-hidden shadow-2xl">
             {/* Placeholder for an image of the finca or a close up of the mountain */}
             <div className="absolute inset-0 bg-gradient-to-tr from-forest-900 to-honey-900/20 flex items-center justify-center text-sand-500 italic text-sm p-8 text-center">
                [Imagen Editorial: El Bosque de Niebla en Piendamó]
             </div>
          </div>
          {/* Decorative label */}
          <div className="absolute -bottom-6 -right-6 bg-honey-700 text-forest-950 px-4 py-2 font-serif text-sm font-bold rounded shadow-lg">
            Auténtico Origen
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
