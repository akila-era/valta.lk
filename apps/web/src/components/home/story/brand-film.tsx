"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The 10-second VALTA.LK brand film (music only, no speech) as the hero's moving background. It plays muted and
 * looped while on screen and pauses when scrolled away; a small control pauses it or turns the sound on (anything
 * moving for over five seconds needs a pause). With reduced motion it waits on its logo frame until play is pressed.
 * `frameClassName` places and masks the film (it drifts slightly against the hero's cursor parallax inside it);
 * `controlsClassName` places the control, which sits outside the frame so the mask never hides it.
 */
export function BrandFilm({ frameClassName = "", controlsClassName = "" }: { frameClassName?: string; controlsClassName?: string }) {
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
      { threshold: 0.15 },
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
    <>
      <div aria-hidden className={frameClassName}>
        <div className="absolute inset-0 [transform:translate3d(calc(var(--mx,0)*-12px),calc(var(--my,0)*-8px),0)_scale(1.04)]">
          <video
            ref={ref}
            className="absolute inset-0 h-full w-full object-cover"
            src="/videos/valta-brand-intro.mp4"
            poster="/images/home/valta-brand-intro-poster.webp"
            muted={muted}
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
      </div>
      <div className={`flex items-center gap-1 rounded-full bg-white/75 p-1 shadow-soft backdrop-blur-md ${controlsClassName}`}>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause background film" : "Play background film"}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5"
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
    </>
  );
}
