"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Product carousel with side arrows and page dots. Native scroll-snap (swipe, trackpad and keyboard all work); the number
 * of visible cards comes from the CSS breakpoint, so pages and dots are measured from the real layout.
 */
export function ProductCarousel({
  label,
  children,
  align = "center",
  step = "page",
  snap = "mandatory",
}: {
  label: string;
  children: ReactNode;
  align?: "center" | "start";
  /** `item` moves one card at a time. `page` moves a full view, which only lines up when an exact number of cards fit. */
  step?: "page" | "item";
  /** Proximity lets a smooth slide finish when the last stop is only part of a card. */
  snap?: "mandatory" | "proximity";
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ pages: 1, page: 0 });

  const distance = useCallback(() => {
    const el = scroller.current;
    if (!el) return 0;
    if (step === "item") return el.querySelector("li")?.getBoundingClientRect().width || el.clientWidth;
    return el.clientWidth;
  }, [step]);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const delta = distance() || el.clientWidth;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    // Page mode rounds a partly filled last view up. Item mode stops on each card, and the final sliver is the last stop.
    const fullSteps = Math.floor(max / delta);
    const remainder = max - fullSteps * delta;
    const pages = step === "item"
      ? (max <= 4 ? 1 : 1 + fullSteps + (remainder > 4 ? 1 : 0))
      : Math.max(1, Math.ceil((el.scrollWidth - 4) / el.clientWidth));
    const atEnd = step === "item" ? el.scrollLeft >= max - 4 : el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const page = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(el.scrollLeft / delta));
    setState((s) => (s.pages === pages && s.page === page ? s : { pages, page }));
  }, [distance, step]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [measure]);

  const goTo = (page: number) => {
    const el = scroller.current;
    if (!el) return;
    const delta = distance() || el.clientWidth;
    el.scrollTo({ left: Math.min(Math.max(0, page * delta), el.scrollWidth - el.clientWidth), behavior: "smooth" });
  };
  const arrow =
    "absolute top-[38%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg shadow-[0_6px_18px_-8px_rgba(16,24,32,0.35)] transition-colors hover:border-ink md:flex";

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        className={`snap-x overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${snap === "proximity" ? "snap-proximity" : "snap-mandatory"}`}
      >
        <ul className={align === "center" ? "flex [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto" : "flex"}>{children}</ul>
      </div>
      {state.pages > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(Math.max(0, state.page - 1))}
            disabled={state.page === 0}
            aria-label={`Previous ${label}`}
            className={`${arrow} -left-5 disabled:opacity-0`}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goTo(Math.min(state.pages - 1, state.page + 1))}
            disabled={state.page === state.pages - 1}
            aria-label={`Next ${label}`}
            className={`${arrow} -right-5 disabled:opacity-0`}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="mt-6 flex items-center justify-center gap-2" role="group" aria-label={`${label} pages`}>
            {Array.from({ length: state.pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to page ${i + 1} of ${state.pages}`}
                aria-current={i === state.page}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span className={`block h-2.5 rounded-full transition-all ${i === state.page ? "w-6 bg-ink" : "w-2.5 bg-ink/25 hover:bg-ink/50"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
