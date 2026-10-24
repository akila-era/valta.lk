"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sticky header wrapper that gains a soft shadow once the page has scrolled. It also publishes how far down the page
 * the header ends (announcement bar included) as --hdr-h, so the homepage hero can fill exactly the rest of the screen,
 * and the height of the sticky part alone as --hdr-sticky, for homepage blocks that fill one screen once scrolled to.
 * With `overlay` (homepage) the header is a thin frosted layer over the hero until the page scrolls, then solid glass.
 */
export function HeaderShell({ children, overlay = false }: { children: ReactNode; overlay?: boolean }) {
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
        data-overlay={overlay}
        className="group/hdr sticky top-0 z-40 border-b border-white/60 bg-white/80 text-ink backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow,border-color] duration-300 data-[scrolled=true]:border-border data-[scrolled=true]:shadow-[0_10px_30px_-18px_rgb(27_23_20/0.35)] data-[overlay=true]:data-[scrolled=false]:border-white/40 data-[overlay=true]:data-[scrolled=false]:bg-white/40 data-[overlay=true]:data-[scrolled=false]:backdrop-blur-md"
      >
        {children}
      </header>
    </>
  );
}
