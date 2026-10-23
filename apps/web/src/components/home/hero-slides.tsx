"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const SLIDES = [
  { src: "/images/home/valta-hero-match.webp", alt: "Smartphones, earbuds, a watch and headphones on stone with orange fabric" },
  { src: "/images/home/valta-hero-audio.webp", alt: "Wireless earbuds and an open charging case in a warm studio" },
  { src: "/images/home/valta-hero-watch.webp", alt: "A silver smartwatch in a warm studio" },
  { src: "/images/home/valta-hero-electronics.webp", alt: "A smartphone and wireless earbuds in a warm studio" },
] as const;

const INTERVAL_MS = 6000;

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Four campaign photographs. Copy stays in the hero; only the picture moves. */
export function HeroSlides() {
  const n = SLIDES.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const touch = useRef<number | null>(null);
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (paused || hover || reduced) return;
    const t = setTimeout(() => go(i + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [i, paused, hover, reduced, go]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Campaign photographs"
      tabIndex={0}
      className="absolute inset-0 overflow-hidden bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node) || !e.currentTarget.contains(next)) setHover(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(i - 1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(i + 1);
        }
      }}
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div
        className={`flex h-full w-full ${reduced ? "" : "transition-transform duration-700 ease-out"}`}
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {SLIDES.map((slide, idx) => (
          <div
            key={slide.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${n}`}
            aria-hidden={idx !== i}
            className="relative h-full w-full shrink-0"
          >
            <Image
              src={slide.src}
              alt={idx === i ? slide.alt : ""}
              fill
              priority={idx === 0}
              sizes="100vw"
              className="object-cover object-[center_58%] md:object-[center_46%]"
            />
          </div>
        ))}
      </div>

      {/* One compact control pill: bottom corner of the photo on phones (swipe replaces the arrows), under the copy on wider screens so it never sits on the products. */}
      <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-0.5 rounded-full bg-white/85 p-0.5 shadow-card backdrop-blur-md sm:p-1 md:bottom-5 md:left-16 md:right-auto lg:left-20">
        <button type="button" onClick={() => go(i - 1)} aria-label="Previous slide" className="hidden h-9 w-9 sm:flex items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5">
          <ChevronLeft className="h-4.5 w-4.5" aria-hidden />
        </button>
        {SLIDES.map((slide, idx) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => go(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            aria-current={idx === i ? "true" : undefined}
            className="group/dot flex h-9 min-w-6 items-center justify-center"
          >
            <span aria-hidden className={`block h-1.5 rounded-full transition-all duration-300 ${idx === i ? "w-6 bg-brand-500" : "w-1.5 bg-ink/25 group-hover/dot:bg-ink/50"}`} />
          </button>
        ))}
        <button type="button" onClick={() => go(i + 1)} aria-label="Next slide" className="hidden h-9 w-9 sm:flex items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5">
          <ChevronRight className="h-4.5 w-4.5" aria-hidden />
        </button>
        <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-ink/10 sm:block" />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
