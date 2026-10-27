import { useEffect, useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

const MILESTONES = [
  {
    time: 0,
    text: "En el corazón de la zona cafetera...",
    position: "left",
  },
  {
    time: 0.3,
    text: "Recolectando la esencia pura del bosque de niebla.",
    position: "right",
  },
  {
    time: 0.6,
    text: "Un vuelo preciso, guiado por el instinto y la naturaleza.",
    position: "left",
  },
  {
    time: 0.9,
    text: "Hacia el refugio donde nace el oro líquido.",
    position: "right",
  },
];

export default function BeeJourney() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Smooth out the scroll progress to avoid jittery video scrubbing
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // We listen to the spring value and update the video currentTime
    const unsubscribe = smoothProgress.onChange((latest) => {
      if (video.duration) {
        video.currentTime = latest * video.duration;
      }
    });

    return () => unsubscribe();
  }, [smoothProgress]);

  return (
    <section
      ref={containerRef}
      className="relative h-[400vh] bg-forest-950" // 400vh gives enough scroll space for a slow, natural journey
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* The Cinematic Video */}
        <video
          ref={videoRef}
          src="/bee-journey.mp4" // This asset must be optimized for scrubbing (high keyframe density)
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Cinematic Overlay: Darkening the edges to focus on the bee */}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-950/40 via-transparent to-forest-950/60 pointer-events-none" />
        <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.6)] pointer-events-none" />

        {/* Scrollytelling Milestone Texts */}
        <div className="relative z-10 h-full w-full">
          {MILESTONES.map((m, i) => (
            <Milestone
              key={i}
              milestone={m}
              progress={smoothProgress}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Milestone({ milestone, progress }) {
  // Calculate when the text should be visible
  // It fades in around the milestone time and fades out shortly after
  const opacity = useTransform(
    progress,
    [milestone.time - 0.1, milestone.time, milestone.time + 0.1],
    [0, 1, 0]
  );

  const y = useTransform(
    progress,
    [milestone.time - 0.1, milestone.time],
    [20, 0]
  );

  return (
    <motion.div
      style={{ opacity, y }}
      className={`absolute top-1/2 -translate-y-1/2 w-full px-6 sm:px-24 flex ${
        milestone.position === 'left' ? 'justify-start' : 'justify-end'
      }`}
    >
      <div className="max-w-md p-6 rounded-2xl backdrop-blur-md bg-forest-900/30 border border-forest-800/50">
        <p className="text-xl sm:text-2xl font-serif text-sand-50 leading-relaxed italic">
          "{milestone.text}"
        </p>
      </div>
    </motion.div>
  );
}
