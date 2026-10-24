"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Phones, data saver, slow connections and reduced motion get the still logo frame until the visitor presses play. */
function shouldAutoplay() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return (
    matchMedia("(min-width: 768px)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !conn?.saveData &&
    !/(^|-)2g|3g/.test(conn?.effectiveType ?? "")
  );
}

/**
 * The 10-second VALTA.LK brand film (music only, no speech) as the hero's moving background. Nothing but the poster
 * loads with the page: on desktop the film is fetched once the page has finished loading (WebM ~1.2 MB, MP4 fallback
 * for older Safari), then plays muted and looped while on screen and pauses when scrolled away. Elsewhere it waits
 * on its logo frame until play is pressed. A small control pauses it or turns the sound on (anything moving for
 * over five seconds needs a pause).
 * `frameClassName` places and masks the film (it drifts slightly against the hero's cursor parallax inside it);
 * `controlsClassName` places the control, which sits outside the frame so the mask never hides it.
 */
export function BrandFilm({ frameClassName = "", controlsClassName = "" }: { frameClassName?: string; controlsClassName?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false); // sources attached
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const auto = useRef(false);
  const visible = useRef(false);
  // Set once the visitor pauses it, so scrolling back does not restart the film against their choice.
  const userPaused = useRef(false);
  // Set when the visitor presses play before the film was loaded.
  const wantPlay = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    auto.current = shouldAutoplay();
    let idle = 0;
    const arm = () => {
      idle = window.setTimeout(() => setArmed(true), 300);
    };
    if (auto.current) {
      if (document.readyState === "complete") arm();
      else window.addEventListener("load", arm, { once: true });
    }
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              visible.current = entry.isIntersecting;
              if (!entry.isIntersecting) v.pause();
              else if (auto.current && !userPaused.current && v.currentSrc) v.play().catch(() => {});
            },
            { threshold: 0.15 },
          )
        : null;
    io?.observe(v);
    return () => {
      io?.disconnect();
      window.removeEventListener("load", arm);
      clearTimeout(idle);
    };
  }, []);

  // Once the sources are attached, start: on desktop when on screen, anywhere when the visitor asked for it.
  useEffect(() => {
    const v = ref.current;
    if (!armed || !v) return;
    v.load();
    if (wantPlay.current || (auto.current && visible.current && !userPaused.current)) v.play().catch(() => {});
  }, [armed]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (!armed) {
      wantPlay.current = true;
      setArmed(true);
    } else if (v.paused) {
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
            poster="/images/home/valta-brand-intro-poster.webp"
            muted={muted}
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            {armed && <source src="/videos/valta-brand-intro.webm" type="video/webm" />}
            {armed && <source src="/videos/valta-brand-intro.mp4" type="video/mp4" />}
          </video>
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
