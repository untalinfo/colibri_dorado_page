import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useEffect, useRef } from 'react';

const VIDEO_SRC = '/assets/bee-flight.mp4';

// Timeline of bee-flight.mp4 (all-intra encoded, so any seek is instant).
const INTRO_END = 1.5; // shadow fades in, played once when the section is revealed
const IDLE_START = 1.5; // idle hover ping-pongs between these two marks
const IDLE_END = 2.5;
const EXIT_END = 5.35; // bee has fully left the frame through the bottom-left

// Scroll window (0..1 of the sticky track) that drives the takeoff.
// The takeoff reacts almost as soon as the frame pins, and ends where the
// next section starts sliding in (see TAIL_OVERLAP), so there is no dead scroll.
const TAKEOFF_FROM = 0.04;
const TAKEOFF_TO = 0.8;

// Entry progress at which the intro (shadow fade-in) starts playing.
const INTRO_TRIGGER = 0.4;

const MAX_FRAME_DT = 0.1; // avoid idle jumps after the tab was in background

const SEEK_EPSILON = 1 / 48; // half a frame at 24fps

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function idleTime(elapsedSeconds) {
  if (elapsedSeconds < INTRO_END) return elapsedSeconds;
  const span = IDLE_END - IDLE_START;
  const phase = (elapsedSeconds - INTRO_END) % (span * 2);
  return IDLE_START + (phase < span ? phase : span * 2 - phase);
}

/**
 * Drives the video's currentTime from a single rAF loop:
 * intro (once) -> idle ping-pong -> scroll-scrubbed takeoff.
 *
 * The idle clock only advances while the takeoff is at rest (k = 0). As soon as
 * the user scrolls, the idle frame is frozen and the scroll alone owns the
 * timeline, so stopping mid-flight holds the bee still instead of looping.
 */
function useBeeFlightPlayback({ videoRef, takeoffProgress, introStartedRef, disabled }) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    if (disabled) {
      video.currentTime = IDLE_START;
      return undefined;
    }

    // iOS Safari will not paint seeks until the element has played once.
    const primeDecoder = () => {
      video
        .play()
        .then(() => video.pause())
        .catch(() => {});
    };
    video.addEventListener('loadeddata', primeDecoder, { once: true });

    let frameId;
    let idleClock = 0;
    let lastNow = null;
    const tick = (now) => {
      const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, MAX_FRAME_DT);
      lastNow = now;

      const k = clamp01((takeoffProgress.get() - TAKEOFF_FROM) / (TAKEOFF_TO - TAKEOFF_FROM));
      if (introStartedRef.current && k === 0) idleClock += dt;

      const idle = idleTime(idleClock);
      const target = idle + (EXIT_END - idle) * k;

      if (video.readyState >= 2 && Math.abs(video.currentTime - target) > SEEK_EPSILON) {
        video.currentTime = target;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      video.removeEventListener('loadeddata', primeDecoder);
    };
  }, [videoRef, takeoffProgress, introStartedRef, disabled]);
}

export default function TransitionBridge() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const introStartedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  // Entry: from the section's top hitting the viewport bottom until it pins.
  const { scrollYProgress: entryProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'start start'],
  });

  // Pinned track: the whole time the sticky frame is on screen.
  const { scrollYProgress: trackProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const takeoffProgress = useSpring(trackProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useMotionValueEvent(entryProgress, 'change', (value) => {
    if (!introStartedRef.current && value > INTRO_TRIGGER) {
      introStartedRef.current = true;
    }
  });

  useBeeFlightPlayback({
    videoRef,
    takeoffProgress,
    introStartedRef,
    disabled: reduceMotion,
  });

  // Dark veil that dissolves the Hero's forest tone into the cream frame.
  const veilOpacity = useTransform(entryProgress, [0, 0.5], [1, 0]);

  // Quote steps aside before the bee crosses the left half.
  const quoteOpacity = useTransform(trackProgress, [0.25, 0.45], [1, 0]);
  const quoteY = useTransform(trackProgress, [0.25, 0.45], [0, -40]);

  return (
    // TAIL_OVERLAP: -mb-[40vh] = (1 - TAKEOFF_TO) * 200vh of sticky track, so the
    // next section starts rising exactly when the bee leaves the frame.
    <section ref={sectionRef} className="relative -mb-[40vh] h-[300vh] bg-sand-50">
      {/*
        Wide landscape (lg+): full-bleed video, quote over the empty left side.
        Portrait / narrow: quote on top, video cropped around the bee below it.
      */}
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          className="absolute inset-x-0 bottom-0 h-[58%] w-full object-cover object-[80%_center] lg:landscape:inset-0 lg:landscape:object-[72%_center] lg:landscape:h-full"
        />

        <motion.div
          style={{ opacity: veilOpacity }}
          className="pointer-events-none absolute inset-0 bg-forest-950"
        />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl items-start px-6 pt-32 sm:pt-40 lg:landscape:items-center lg:landscape:pt-0">
          <motion.div style={{ opacity: quoteOpacity, y: quoteY }} className="max-w-xl">
            <motion.h2
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              viewport={{ once: true }}
              className="mb-6 text-left font-serif text-4xl italic leading-tight text-forest-950 sm:text-6xl lg:landscape:text-7xl"
            >
              "La pureza que nace en el silencio <br /> del amanecer andino."
            </motion.h2>
            <div className="h-px w-24 bg-honey-500" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
