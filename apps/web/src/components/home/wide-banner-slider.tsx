"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface WideSlide {
  image: string;
  alt: string;
  href?: string;
}

const INTERVAL_MS = 5000;

/**
 * Full-width picture banner. With several pictures it cross-fades from one to the next every few seconds, with dots and
 * arrows. It pauses while the pointer or keyboard focus is on it, and does not move on its own for visitors who asked
 * their system for reduced motion (the dots and arrows still work).
 */
export function WideBannerSlider({ slides }: { slides: WideSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const many = slides.length > 1;

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!many || paused || reduced) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [many, paused, reduced, slides.length, index]);

  const go = (n: number) => setIndex((n + slides.length) % slides.length);

  return (
    <div
      className="group relative aspect-[16/9] overflow-hidden rounded-2xl bg-surface sm:aspect-[21/8]"
      role={many ? "group" : undefined}
      aria-roledescription={many ? "carousel" : undefined}
      aria-label={many ? "Promotions" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {slides.map((s, i) => {
        const active = i === index;
        const picture = <Image src={s.image} alt={s.alt} fill unoptimized={s.image.startsWith("/api/")} sizes="(min-width:1536px) 1400px, 100vw" className="object-cover" loading={i === 0 ? "eager" : "lazy"} />;
        return (
          <div
            key={s.image}
            aria-hidden={!active}
            aria-roledescription={many ? "slide" : undefined}
            aria-label={many ? `${i + 1} of ${slides.length}` : undefined}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {s.href ? (
              <Link href={s.href} tabIndex={active ? undefined : -1} className="relative block h-full w-full">
                {picture}
              </Link>
            ) : (
              picture
            )}
          </div>
        );
      })}

      {many && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => go(index - 1)}
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-on-brand shadow-md transition-opacity hover:bg-white md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => go(index + 1)}
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-on-brand shadow-md transition-opacity hover:bg-white md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.image}
                type="button"
                aria-label={`Show banner ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full bg-white shadow transition-all duration-300 motion-reduce:transition-none ${i === index ? "w-6" : "w-2 opacity-60 hover:opacity-100"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
