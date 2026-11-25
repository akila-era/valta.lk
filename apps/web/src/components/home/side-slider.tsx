"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export interface SidePic {
  image: string;
  alt: string;
  href?: string;
}

function Tile({ pics, index, onSelect, label, eager }: { pics: SidePic[]; index: number; onSelect: (i: number) => void; label: string; eager: boolean }) {
  const n = pics.length;
  return (
    <div role="region" aria-roledescription={n > 1 ? "carousel" : undefined} aria-label={label} className="relative h-full min-h-0 overflow-hidden bg-ink">
      {pics.map((p, i) => {
        const on = i === index;
        const img = <Image src={p.image} alt={p.alt} fill sizes="(min-width:1024px) 33vw, 100vw" loading={eager && on ? "eager" : "lazy"} unoptimized={p.image.startsWith("/api/")} className="kb-img object-cover" />;
        return (
          <div
            key={`${p.image}-${i}`}
            role={n > 1 ? "group" : undefined}
            aria-roledescription={n > 1 ? "slide" : undefined}
            aria-label={n > 1 ? `${i + 1} of ${n}` : undefined}
            aria-hidden={n > 1 && !on}
            inert={n > 1 && !on}
            className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${on ? "is-active scale-100 opacity-100" : "pointer-events-none scale-[1.04] opacity-0"}`}
          >
            {p.href ? (
              <Link href={p.href} className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600">
                {img}
              </Link>
            ) : (
              img
            )}
          </div>
        );
      })}
      {n > 1 && (
        <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center">
          <div className="flex items-center rounded-full bg-black/35 px-1.5 backdrop-blur-sm" role="group" aria-label={`${label} pictures`}>
            {pics.map((_, i) => (
              <button key={i} type="button" onClick={() => onSelect(i)} aria-label={`Picture ${i + 1} of ${n}`} aria-current={i === index} className="flex h-6 w-5 items-center justify-center">
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-brand-500" : "w-1.5 bg-white/70"}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STEP_MS = 5500;

/**
 * The two pictures beside the hero slider. Both slide through the same pictures on one timer, one step apart, so the two
 * tiles never show the same picture at once (with three or more pictures the lower tile moves first, then the upper one half a
 * step later). The timer pauses while the pointer or keyboard focus is on the tiles, and it does not run for visitors who ask
 * for reduced motion.
 */
export function SidePair({ pics, className = "" }: { pics: SidePic[]; className?: string }) {
  const n = pics.length;
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(n > 1 ? 1 : 0);
  const [hold, setHold] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (n < 2 || hold || reduced) return;
    let late: number | undefined;
    const id = window.setInterval(() => {
      if (n === 2) {
        setTop((t) => (t + 1) % n);
        setBottom((b) => (b + 1) % n);
        return;
      }
      setBottom((b) => (b + 1) % n);
      late = window.setTimeout(() => setTop((t) => (t + 1) % n), STEP_MS / 2);
    }, STEP_MS);
    return () => {
      window.clearInterval(id);
      if (late) window.clearTimeout(late);
    };
  }, [n, hold, reduced]);

  if (!n) return null;
  // Picking a dot on one tile moves the other so the two stay different.
  const pickTop = (i: number) => {
    setTop(i);
    if (n > 1) setBottom((i + 1) % n);
  };
  const pickBottom = (i: number) => {
    setBottom(i);
    if (n > 1) setTop((i + n - 1) % n);
  };
  return (
    <div
      className={className}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <Tile pics={pics} index={top} onSelect={pickTop} label="Featured pictures, top" eager />
      {n > 1 && <Tile pics={pics} index={bottom} onSelect={pickBottom} label="Featured pictures, bottom" eager={false} />}
    </div>
  );
}
