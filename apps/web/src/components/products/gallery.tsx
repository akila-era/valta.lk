"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "./product-card";

export function Gallery({ images, alt, alts, captions }: { images: string[]; alt: string; alts?: string[]; captions?: string[] }) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const many = images.length > 1;
  const touchX = useRef<number | null>(null);
  const thumbs = useRef<HTMLUListElement>(null);
  const index = images.length ? Math.min(active, images.length - 1) : 0;

  function move(step: number) {
    if (!many) return;
    setActive((i) => (i + step + images.length) % images.length);
  }

  const caption = captions?.[index];

  // Keep the active thumbnail in view when the strip scrolls sideways (scrolls the strip only, never the page).
  useEffect(() => {
    const strip = thumbs.current;
    const item = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !item) return;
    const box = strip.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) {
      strip.scrollBy({ left: r.left - box.left - (box.width - r.width) / 2, behavior: "smooth" });
    }
  }, [index]);

  return (
    <div>
      <div
        className="relative aspect-square touch-pan-y overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
        tabIndex={many ? 0 : undefined}
        role={many ? "group" : undefined}
        aria-label={many ? `${alt}. Image ${index + 1} of ${images.length}. Use the arrow keys to change image.` : undefined}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null || Math.abs(end - start) < 40) return;
          move(end < start ? 1 : -1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        <ProductImage
          src={broken[index] ? undefined : images[index]}
          alt={alts?.[index] || alt}
          sizes="(min-width:1024px) 50vw, 100vw"
          priority
          onError={() => setBroken((current) => ({ ...current, [index]: true }))}
        />
        {many && (
          <>
            <button type="button" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg/95 text-ink shadow-card hover:bg-bg" aria-label="Previous image" onClick={() => move(-1)}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg/95 text-ink shadow-card hover:bg-bg" aria-label="Next image" onClick={() => move(1)}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-bg/95 px-3 py-1 text-xs font-semibold text-ink" aria-hidden>
              {index + 1} / {images.length}
            </p>
          </>
        )}
      </div>
      {caption ? <p className="mt-2 text-center text-sm text-muted">{caption}</p> : null}
      {many && (
        <ul ref={thumbs} className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Product images">
          {images.map((src, i) => (
            <li key={`${src}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={`relative block h-16 w-16 overflow-hidden rounded-lg border-2 bg-surface transition-[border-color,opacity] ${i === index ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                <ProductImage src={broken[i] ? undefined : src} alt="" sizes="64px" padding="p-1.5" onError={() => setBroken((current) => ({ ...current, [i]: true }))} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
