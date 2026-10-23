"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const INTERVAL_MS = 7000;

/**
 * Accessible hero carousel: arrows, dots, keyboard, swipe, and auto-advance that pauses on hover/focus,
 * stops under prefers-reduced-motion, and has an explicit pause button (WCAG 2.2.2).
 * With a single slide it renders the slide alone, with no controls.
 */
export function HeroCarousel({ children, labels }: { children: ReactNode; labels: string[] }) {
  const slides = Children.toArray(children);
  const n = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || paused || hover || reduced) return;
    const t = setTimeout(() => go(i + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [i, n, paused, hover, reduced, go]);

  if (n < 2) return <>{slides}</>;

  const arrow =
    "absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[0_6px_20px_-6px_rgba(17,19,24,0.35)] transition-transform hover:scale-105 min-[1700px]:flex"; // only where the side gutter clears the hero text
  const small = "flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-white/90 text-ink hover:bg-white min-[1700px]:hidden";

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="grid">
        {slides.map((s, idx) => (
          <div
            key={idx}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${n}: ${labels[idx] ?? ""}`}
            aria-hidden={idx !== i}
            inert={idx !== i}
            className={`[grid-area:1/1] transition-opacity duration-700 ease-out ${idx === i ? "z-10 opacity-100" : "z-0 opacity-0"}`}
          >
            {s}
          </div>
        ))}
      </div>

      <button type="button" onClick={() => go(i - 1)} className={`${arrow} left-6`} aria-label="Previous slide">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" onClick={() => go(i + 1)} className={`${arrow} right-6`} aria-label="Next slide">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2.5">
        <button type="button" onClick={() => go(i - 1)} className={`${small} mr-1.5`} aria-label="Previous slide">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => go(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            aria-current={idx === i}
            className={`h-2.5 rounded-full border-2 transition-all ${idx === i ? "w-7 border-brand-500 bg-brand-500" : "w-7 border-ink/25 bg-white/90 hover:border-ink/50"}`}
          />
        ))}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-white/90 text-ink hover:bg-white"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button type="button" onClick={() => go(i + 1)} className={`${small} ml-1.5`} aria-label="Next slide">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
