"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { ProductImage } from "./product-card";

/**
 * Product pictures: thumbnails in a column beside the main picture on wide screens (a row below it on phones), swipe and
 * arrow keys to change picture, and a full-size view when the picture is pressed.
 */
export function Gallery({ images, alt, alts, captions }: { images: string[]; alt: string; alts?: string[]; captions?: string[] }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
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

  // Keep the active thumbnail in view when the strip scrolls (the strip only, never the page).
  useEffect(() => {
    const strip = thumbs.current;
    const item = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !item) return;
    const box = strip.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const vertical = strip.scrollHeight > strip.clientHeight + 2 && strip.scrollWidth <= strip.clientWidth + 2;
    if (vertical) {
      if (r.top < box.top || r.bottom > box.bottom) strip.scrollBy({ top: r.top - box.top - (box.height - r.height) / 2, behavior: "smooth" });
    } else if (r.left < box.left || r.right > box.right) {
      strip.scrollBy({ left: r.left - box.left - (box.width - r.width) / 2, behavior: "smooth" });
    }
  }, [index]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, images.length]);

  const arrow = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-ink opacity-90 transition-all hover:border-ink hover:opacity-100 focus-visible:opacity-100";

  return (
    <div className={many ? "lg:grid lg:grid-cols-[5rem_minmax(0,1fr)] lg:gap-3" : ""}>
      <div
        className="relative aspect-square touch-pan-y overflow-hidden rounded-xl border border-border bg-white lg:order-2"
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
          sizes="(min-width:1024px) 45vw, 100vw"
          priority
          onError={() => setBroken((current) => ({ ...current, [index]: true }))}
        />
        {images[index] && !broken[index] && (
          <button type="button" onClick={() => setZoom(true)} aria-label="View image full size" className="absolute inset-0 cursor-zoom-in" tabIndex={-1}>
            <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-ink"><ZoomIn className="h-4 w-4" aria-hidden /></span>
          </button>
        )}
        {many && (
          <>
            <button type="button" className={`${arrow} left-3`} aria-label="Previous image" onClick={() => move(-1)}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" className={`${arrow} right-3`} aria-label="Next image" onClick={() => move(1)}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      {caption ? <p className="mt-2 text-center text-sm text-muted lg:order-3 lg:col-start-2">{caption}</p> : null}

      {many && (
        <ul ref={thumbs} className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:order-1 lg:mt-0 lg:max-h-[34rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0" aria-label="Product images">
          {images.map((src, i) => (
            <li key={`${src}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={`relative block h-16 w-16 overflow-hidden rounded-lg border-2 bg-white transition-all duration-200 lg:h-20 lg:w-20 ${i === index ? "border-brand-500" : "border-border opacity-80 hover:border-ink hover:opacity-100"}`}
              >
                <ProductImage src={broken[i] ? undefined : src} alt="" sizes="80px" padding="p-1.5" onError={() => setBroken((current) => ({ ...current, [i]: true }))} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={`${alt}, full size`} className="fixed inset-0 z-[90] flex items-center justify-center bg-white/95 p-4" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of the catalogue picture */}
          <img src={images[index]} alt={alts?.[index] || alt} width={1200} height={1200} className="max-h-full max-w-full object-contain" />
          <button type="button" aria-label="Close full size view" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white" onClick={() => setZoom(false)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
