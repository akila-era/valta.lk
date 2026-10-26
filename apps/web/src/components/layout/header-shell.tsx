"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sticky header wrapper that gains a soft shadow once the page has scrolled. It also publishes the height of the sticky
 * part as --hdr-sticky, so sticky in-page navigation (product page) can sit just below it.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--hdr-sticky", `${Math.round(el.offsetHeight)}px`);
    };
    publish();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="absolute h-px w-px" />
      <header
        ref={header}
        data-scrolled={scrolled}
        className="group/hdr sticky top-0 z-40 border-b border-border bg-bg text-ink transition-shadow duration-300 data-[scrolled=true]:shadow-[0_6px_20px_-12px_rgb(16_24_40/0.3)]"
      >
        {children}
      </header>
    </>
  );
}
