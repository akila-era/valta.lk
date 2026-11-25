"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/** Keep in step with the `hero-progress` animation duration in globals.css. */
const INTERVAL_MS = 6500;

interface HeroSliderProps {
  /** Headline, supporting text and buttons (rendered on the server). */
  intro: ReactNode;
  /** One server-rendered stage per real product. */
  slides: ReactNode[];
  /** Product names, used for the indicator labels. */
  labels: string[];
}

/**
 * The hero's moving part. It only decides which of the already rendered products is showing: it fades between them, shows
 * numbered progress indicators and offers arrows and a pause button. It never starts on its own for shoppers who ask for
 * reduced motion, pauses while the pointer or keyboard focus is inside, and does nothing at all when there is one product.
 */
export function HeroSlider({ intro, slides, labels }: HeroSliderProps) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [reduced, setReduced] = useState(false); // read from the browser right after mount; autoplay is cancelled at once if motion is reduced
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const auto = count > 1 && !userPaused && !hold && !reduced;

  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [auto, index, count]);

  const go = (i: number) => setIndex(((i % count) + count) % count);
  const round = "flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured products"
      className="grid gap-6 px-5 pb-6 pt-8 sm:px-10 sm:pb-9 sm:pt-12 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-[1fr_auto] lg:gap-x-12 lg:gap-y-0 lg:px-14 lg:pb-10 lg:pt-12"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <div className="animate-lift self-center lg:col-start-1 lg:row-start-1">{intro}</div>

      <div
        className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
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
        <div className="animate-lift relative aspect-[6/5] [--d:150ms] sm:aspect-[16/11] lg:aspect-auto lg:h-[22rem]" aria-live={auto ? "off" : "polite"}>
          {slides.map((slide, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== index}
              inert={i !== index}
              className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${i === index ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="flex items-center gap-3 lg:col-start-1 lg:row-start-2 lg:mt-8 lg:gap-5">
          <ol className="flex items-center gap-3 sm:gap-4">
            {labels.map((label, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`${String(i + 1).padStart(2, "0")}, ${label}, product ${i + 1} of ${count}`}
                  aria-current={i === index ? "true" : undefined}
                  className="flex min-h-11 flex-col justify-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span className={`text-sm font-semibold tabular-nums ${i === index ? "text-white" : "text-white/60"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="relative block h-0.5 w-11 overflow-hidden rounded-full bg-white/25 sm:w-16">
                    <span
                      key={`${index}-${auto}`}
                      className={`absolute inset-0 origin-left rounded-full bg-brand-500 ${i === index ? (auto ? "animate-hero-progress" : "") : "scale-x-0"}`}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous product" className={round}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next product" className={round}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            {!reduced && (
              <button type="button" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? "Play slideshow" : "Pause slideshow"} className={round}>
                {userPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
