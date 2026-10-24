"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sticky header wrapper that gains a soft shadow once the page has scrolled. It also publishes how far down the page
 * the header ends (announcement bar included) as --hdr-h, so the homepage hero can fill exactly the rest of the screen,
 * and the height of the sticky part alone as --hdr-sticky, for homepage blocks that fill one screen once scrolled to.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const publish = () => {
      const root = document.documentElement.style;
      root.setProperty("--hdr-h", `${Math.round(el.offsetTop + el.offsetHeight)}px`);
      root.setProperty("--hdr-sticky", `${Math.round(el.offsetHeight)}px`);
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
        className="group/hdr sticky top-0 z-40 border-b border-border bg-bg/95 text-ink backdrop-blur-md transition-shadow duration-200 data-[scrolled=true]:shadow-raised"
      >
        {children}
      </header>
    </>
  );
}
