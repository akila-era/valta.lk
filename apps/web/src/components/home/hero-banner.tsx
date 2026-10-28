"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** A studio photograph with a caption and one call to action. */
interface CaptionSlide {
  kind?: "caption";
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  /** Dark photographs get light text. */
  dark?: boolean;
}

/** A finished banner picture uploaded by staff (its text is part of the picture), optionally a link. */
interface ImageSlide {
  kind: "image";
  src: string;
  alt: string;
  href?: string;
}

export type HeroSlide = CaptionSlide | ImageSlide;

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

/**
 * The homepage banner carousel: staff banner pictures shown as uploaded, then studio photographs with a short caption
 * and one call to action on the left. Numbered markers (01, 02, 03) show the position. Slides move on their own (paused on hover, focus, with the pause button or reduced motion), and
 * can be changed with the arrows, the dots, the arrow keys or a swipe.
 */
export function HeroBanner({ slides, bleed = false }: { slides: HeroSlide[]; bleed?: boolean }) {
  const n = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const touch = useRef<number | null>(null);
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (paused || hover || reduced || n < 2) return;
    const t = setTimeout(() => go(i + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [i, paused, hover, reduced, go, n]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured"
      className={`relative h-full overflow-hidden bg-surface ${bleed ? "" : "rounded-panel"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node) || !e.currentTarget.contains(next)) setHover(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
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
      <div className={`flex h-full w-full ${reduced ? "" : "transition-transform duration-700 ease-out"}`} style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, idx) => (
          <div
            key={s.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${n}`}
            aria-hidden={idx !== i}
            inert={idx !== i}
            className="relative h-full w-full shrink-0 overflow-hidden"
          >
            {s.kind === "image" ? (
              s.href ? (
                <Link href={s.href} className="relative block h-full w-full">
                  <Image src={s.src} alt={s.alt} fill priority={idx === 0} unoptimized={s.src.startsWith("/api/")} sizes="100vw" className="object-cover" />
                </Link>
              ) : (
                <Image src={s.src} alt={s.alt} fill priority={idx === 0} unoptimized={s.src.startsWith("/api/")} sizes="100vw" className="object-cover" />
              )
            ) : (
            <>
            <Image src={s.src} alt={s.alt} fill priority={idx === 0} sizes="100vw" className="object-cover object-[72%_50%]" />
            {/* A wash from the left keeps the caption legible over the photograph. */}
            <span aria-hidden className={`absolute inset-0 ${s.dark ? "bg-gradient-to-r from-black/80 via-black/55 to-black/10 sm:via-black/40 sm:to-transparent" : "bg-gradient-to-r from-white/95 via-white/80 to-white/20 sm:from-white/90 sm:via-white/40 sm:to-transparent"}`} />
            <div className={`relative flex h-full flex-col justify-center pb-16 pt-8 ${bleed ? "container-page" : "px-6 sm:px-10 lg:px-14"} ${s.dark ? "text-white" : "text-ink"}`}>
              <div className="max-w-[34rem]">
              <p className={`text-xs font-bold uppercase tracking-[0.16em] ${s.dark ? "text-brand-400" : "text-brand-600"}`}>{s.eyebrow}</p>
              <p className="mt-3 font-display text-[clamp(1.9rem,1.2rem+2.8vw,3.75rem)] font-extrabold leading-[1.05] tracking-title">{s.title}</p>
              <p className={`mt-3 max-w-sm text-sm leading-6 sm:text-[15px] ${s.dark ? "text-white/80" : "text-ink/75"}`}>{s.text}</p>
              <Link href={s.href} className="btn-primary mt-6 w-fit px-6">
                {s.cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              </div>
            </div>
            </>
            )}
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          {/* Numbered markers on a dark glass strip, so they read on light and dark pictures alike. */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-control bg-black/45 px-2 py-1 text-white backdrop-blur-sm">
            {slides.map((s, idx) => (
              <button
                key={s.src}
                type="button"
                onClick={() => go(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                aria-current={idx === i ? "true" : undefined}
                className="group/dot flex h-8 items-center gap-1.5 px-1.5 text-xs font-bold tabular-nums"
              >
                <span aria-hidden className={idx === i ? "text-white" : "text-white/55 group-hover/dot:text-white"}>{String(idx + 1).padStart(2, "0")}</span>
                <span aria-hidden className={`block h-0.5 rounded-full transition-all duration-300 ${idx === i ? "w-8 bg-brand-500" : "w-3 bg-white/40"}`} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play slideshow" : "Pause slideshow"}
              className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-control text-white/75 transition-colors hover:text-white"
            >
              {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
          <div className="absolute bottom-4 right-4 z-10 hidden gap-2 sm:flex lg:right-8">
            <button type="button" onClick={() => go(i - 1)} aria-label="Previous slide" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-card transition-colors hover:bg-brand-500 hover:text-on-brand">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Next slide" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-card transition-colors hover:bg-brand-500 hover:text-on-brand">
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
