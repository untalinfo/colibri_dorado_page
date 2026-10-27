import { useEffect, useRef, useState } from 'react';

/**
 * Dual-buffer seamless video loop with smooth crossfade dissolve.
 * Eliminates jump cuts and harsh object popping at the end of video cycles.
 */
export default function SeamlessVideoBackground({
  src = '/hero-forest-10s.mp4',
  playbackRate = 0.55,
}) {
  const videoRefA = useRef(null);
  const videoRefB = useRef(null);
  const [activeVideo, setActiveVideo] = useState('A');

  useEffect(() => {
    const vidA = videoRefA.current;
    const vidB = videoRefB.current;
    if (!vidA || !vidB) return;

    // Apply playback speed reduction
    vidA.playbackRate = playbackRate;
    vidB.playbackRate = playbackRate;

    // Crossfade trigger before video ends
    const FADE_THRESHOLD = 0.9;
    const wallClockTimeout = (FADE_THRESHOLD / playbackRate) * 1000;
    let isTransitioning = false;

    const playSafe = (media) => {
      try {
        const promise = media?.play?.();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      } catch {
        // Autoplay policy or jsdom environment
      }
    };

    const handleTimeUpdateA = () => {
      if (vidA.duration && vidA.currentTime >= vidA.duration - FADE_THRESHOLD && !isTransitioning) {
        isTransitioning = true;
        vidB.currentTime = 0;
        vidB.playbackRate = playbackRate;
        playSafe(vidB);
        setActiveVideo('B');

        setTimeout(() => {
          vidA.pause?.();
          vidA.currentTime = 0;
          isTransitioning = false;
        }, wallClockTimeout);
      }
    };

    const handleTimeUpdateB = () => {
      if (vidB.duration && vidB.currentTime >= vidB.duration - FADE_THRESHOLD && !isTransitioning) {
        isTransitioning = true;
        vidA.currentTime = 0;
        vidA.playbackRate = playbackRate;
        playSafe(vidA);
        setActiveVideo('A');

        setTimeout(() => {
          vidB.pause?.();
          vidB.currentTime = 0;
          isTransitioning = false;
        }, wallClockTimeout);
      }
    };

    vidA.addEventListener('timeupdate', handleTimeUpdateA);
    vidB.addEventListener('timeupdate', handleTimeUpdateB);

    playSafe(vidA);

    return () => {
      vidA.removeEventListener('timeupdate', handleTimeUpdateA);
      vidB.removeEventListener('timeupdate', handleTimeUpdateB);
    };
  }, [playbackRate]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      data-testid="seamless-video-bg"
    >
      <video
        ref={videoRefA}
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover mix-blend-luminosity filter contrast-125 transition-opacity duration-1000 ease-in-out pointer-events-none ${
          activeVideo === 'A' ? 'opacity-35' : 'opacity-0'
        }`}
      />
      <video
        ref={videoRefB}
        src={src}
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover mix-blend-luminosity filter contrast-125 transition-opacity duration-1000 ease-in-out pointer-events-none ${
          activeVideo === 'B' ? 'opacity-35' : 'opacity-0'
        }`}
      />
    </div>
  );
}
