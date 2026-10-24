"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const SLIDES = [
  {
    src: "/images/home/valta-hero-laptops.webp",
    alt: "Premium laptops and ultrabooks in a modern workspace",
  },
  {
    src: "/images/home/valta-hero-gaming.webp",
    alt: "Dark gaming setup with RGB PC, ultra-wide monitor, mechanical keyboard and headset",
  },
  {
    src: "/images/home/valta-hero-mobile.webp",
    alt: "Flagship smartphone, smartwatch and wireless earbuds in a modern product studio",
  },
  {
    src: "/images/home/valta-hero-accessories.webp",
    alt: "Premium travel backpack, power banks, fast chargers and braided cables",
  },
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

/** Four warm studio campaign photographs. Copy stays in the hero; only the picture moves. */
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
      className="absolute inset-0 overflow-hidden bg-[#f6efe7] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
            <span className="absolute inset-0">
              <Image src={slide.src} alt={idx === i ? slide.alt : ""} fill priority={idx === 0} sizes="100vw" className={`object-cover object-[center_60%] md:object-[70%_50%] ${idx === i ? "animate-kenburns" : ""}`} />
            </span>
          </div>
        ))}
      </div>

      {/* Dots (and pause, since the slides move on their own) bottom-left under the copy; round arrows bottom-right. */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-full bg-white/70 px-1 backdrop-blur-sm md:bottom-6 md:left-4 md:bg-transparent md:px-0 md:backdrop-blur-none lg:left-6">
        {SLIDES.map((slide, idx) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => go(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            aria-current={idx === i ? "true" : undefined}
            className="group/dot flex h-8 min-w-6 items-center justify-center"
          >
            <span aria-hidden className={`block h-1.5 rounded-full transition-all duration-300 ${idx === i ? "w-6 bg-brand-500" : "w-1.5 bg-ink/25 group-hover/dot:bg-ink/50"}`} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
      <div className="absolute bottom-3 right-3 z-20 hidden gap-2 sm:flex md:bottom-6 md:right-6">
        <button type="button" onClick={() => go(i - 1)} aria-label="Previous slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-card backdrop-blur-sm transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" onClick={() => go(i + 1)} aria-label="Next slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink shadow-card backdrop-blur-sm transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
