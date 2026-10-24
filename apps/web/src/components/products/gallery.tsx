"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useDialogLifecycle } from "@/components/ui/overlay";
import { ProductImage } from "./product-card";

export function Gallery({ images, alt, alts, captions }: { images: string[]; alt: string; alts?: string[]; captions?: string[] }) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [zoomed, setZoomed] = useState(false);
  const many = images.length > 1;
  const touchX = useRef<number | null>(null);
  const thumbs = useRef<HTMLUListElement>(null);
  const zoomPanel = useRef<HTMLDivElement>(null);
  const index = images.length ? Math.min(active, images.length - 1) : 0;
  const canZoom = Boolean(images[index]) && !broken[index];
  const closeZoom = useCallback(() => setZoomed(false), []);
  useDialogLifecycle(zoomed, closeZoom, zoomPanel);

  function move(step: number) {
    if (!many) return;
    setActive((i) => (i + step + images.length) % images.length);
  }

  const caption = captions?.[index];
  const label = alts?.[index] || alt;

  // Keep the active thumbnail in view when the strip scrolls (scrolls the strip only, never the page).
  useEffect(() => {
    const strip = thumbs.current;
    const item = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !item) return;
    const box = strip.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) strip.scrollBy({ left: r.left - box.left - (box.width - r.width) / 2, behavior: "smooth" });
    else if (r.top < box.top || r.bottom > box.bottom) strip.scrollBy({ top: r.top - box.top - (box.height - r.height) / 2, behavior: "smooth" });
  }, [index]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      touchX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = touchX.current;
      touchX.current = null;
      const end = e.changedTouches[0]?.clientX;
      if (start == null || end == null || Math.abs(end - start) < 40) return;
      move(end < start ? 1 : -1);
    },
  };
  const arrowKeys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    }
  };
  const roundButton = "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg/95 text-ink shadow-card transition-colors hover:border-ink/30";

  return (
    // Desktop: thumbnails run down the left of the photo, and the gallery stays beside the details while they scroll.
    <div className="lg:sticky lg:top-36 lg:self-start">
      <div className={many ? "lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-3" : undefined}>
        <div
          className="media-spot relative mx-auto aspect-square w-full touch-pan-y overflow-hidden rounded-2xl border border-border lg:order-2 lg:h-[min(36rem,calc(100svh-16rem))] lg:w-auto lg:max-w-full"
          tabIndex={many ? 0 : undefined}
          role={many ? "group" : undefined}
          aria-label={many ? `${alt}. Image ${index + 1} of ${images.length}. Use the arrow keys to change image.` : undefined}
          onKeyDown={arrowKeys}
          {...swipe}
        >
          <ProductImage
            src={broken[index] ? undefined : images[index]}
            alt={label}
            sizes="(min-width:1024px) 45vw, 100vw"
            priority
            padding="p-6 sm:p-10"
            onError={() => setBroken((current) => ({ ...current, [index]: true }))}
          />
          {canZoom && (
            <button type="button" className={`${roundButton} absolute right-3 top-3`} aria-label="View image larger" onClick={() => setZoomed(true)}>
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          {many && (
            <>
              <button type="button" className={`${roundButton} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Previous image" onClick={() => move(-1)}>
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" className={`${roundButton} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Next image" onClick={() => move(1)}>
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold tabular-nums text-bg" aria-hidden>
                {index + 1} / {images.length}
              </p>
            </>
          )}
        </div>
        {many && (
          <ul
            ref={thumbs}
            className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:order-1 lg:mt-0 lg:max-h-[min(36rem,calc(100svh-16rem))] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0 lg:pr-0.5"
            aria-label="Product images"
          >
            {images.map((src, i) => (
              <li key={`${src}-${i}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  aria-current={i === index}
                  className={`relative block h-16 w-16 overflow-hidden rounded-xl border bg-bg transition-[border-color,box-shadow,opacity] duration-200 lg:h-[4.5rem] lg:w-[4.5rem] ${
                    i === index ? "border-brand-500 shadow-[0_0_0_2px_var(--color-brand-100)]" : "border-border opacity-75 hover:border-ink/25 hover:opacity-100"
                  }`}
                >
                  <ProductImage src={broken[i] ? undefined : src} alt="" sizes="72px" padding="p-1.5" onError={() => setBroken((current) => ({ ...current, [i]: true }))} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {caption ? <p className="mt-2 text-center text-sm text-muted">{caption}</p> : null}

      {/* Portalled to <body>: the sticky gallery column is its own stacking context and would trap the overlay under the header. */}
      {zoomed && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-8">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/70" aria-label="Close larger image" onClick={closeZoom} />
          <div
            ref={zoomPanel}
            role="dialog"
            aria-modal="true"
            aria-label={`${label}, larger view`}
            className="relative z-10 flex h-full max-h-[56rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-bg shadow-overlay"
            onKeyDown={arrowKeys}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold">{label}</p>
              <button type="button" className={roundButton} aria-label="Close larger image" onClick={closeZoom}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="relative flex-1" {...swipe}>
              <ProductImage src={broken[index] ? undefined : images[index]} alt={label} sizes="100vw" padding="p-4 sm:p-8" />
              {many && (
                <>
                  <button type="button" className={`${roundButton} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Previous image" onClick={() => move(-1)}>
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <button type="button" className={`${roundButton} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Next image" onClick={() => move(1)}>
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
