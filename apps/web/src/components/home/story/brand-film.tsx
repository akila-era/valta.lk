"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The 10-second VALTA.LK brand film (music only, no speech). It plays muted and looped while it is on screen and pauses
 * when scrolled away; visitors can pause it or turn the sound on. With reduced motion it waits on its logo frame
 * until play is pressed. The file loads only its metadata until it first comes into view.
 */
export function BrandFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // Set once the visitor pauses it, so scrolling back does not restart the film against their choice.
  const userPaused = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPaused.current) v.play().catch(() => {});
        else if (!entry.isIntersecting) v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      v.play().catch(() => {});
    } else {
      userPaused.current = true;
      v.pause();
    }
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#efe8df]">
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/valta-brand-intro.mp4"
        poster="/images/home/valta-brand-intro-poster.webp"
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label="VALTA.LK brand film: phones, laptops and headphones float on stages around the VALTA.LK logo"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-full bg-white/75 p-1 shadow-soft backdrop-blur-md sm:bottom-5 sm:left-5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause brand film" : "Play brand film"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-on-brand transition-colors hover:bg-brand-hover"
        >
          {playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5"
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
