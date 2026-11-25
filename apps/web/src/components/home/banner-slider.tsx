"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const INTERVAL_MS = 6000;

/**
 * Full-bleed banner slider with numbered line indicators and side arrows. Pauses while hovered or focused, never starts on its
 * own for visitors who ask for reduced motion, and shows no controls when there is only one slide.
 */
export function BannerSlider({ slides, label, className = "" }: { slides: ReactNode[]; label: string; className?: string }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const auto = count > 1 && !hold && !reduced;
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [auto, index, count]);

  const go = (i: number) => setIndex(((i % count) + count) % count);
  const arrow = "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/55 md:flex";

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={`relative overflow-hidden bg-ink ${className}`}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (count > 1 && start != null && end != null && Math.abs(end - start) > 45) go(index + (end < start ? 1 : -1));
      }}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          aria-hidden={i !== index}
          inert={i !== index}
          className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${i === index ? "is-active opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {slide}
        </div>
      ))}
      {count > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous banner" className={`${arrow} left-3`}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next banner" className={`${arrow} right-3`}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <ol className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-4 px-4">
            {slides.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Banner ${i + 1} of ${count}`}
                  aria-current={i === index ? "true" : undefined}
                  className="flex min-h-9 items-center gap-2 text-[13px] font-semibold tabular-nums text-white"
                >
                  <span className={i === index ? "text-white" : "text-white/60"}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={`block h-0.5 rounded-full transition-all ${i === index ? "w-10 bg-brand-500" : "w-5 bg-white/50"}`} />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
