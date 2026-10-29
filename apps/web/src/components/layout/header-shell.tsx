"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sticky header wrapper (it scrolls away on short landscape screens, where it would take a third of the view) that gains a soft shadow once the page has scrolled. It also publishes the height of the sticky
 * part as --hdr-sticky, so sticky in-page navigation (product page) can sit just below it.
 *
 * The whole header, category row included, stays in place while scrolling; a neon orange line pinned to the very top
 * of the window shows how far down the page the visitor is.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const publish = () => {
      // On short landscape screens the header scrolls away (static, see below), so nothing sticks and the offset is 0.
      const sticks = getComputedStyle(el).position === "sticky";
      document.documentElement.style.setProperty("--hdr-sticky", `${sticks ? Math.round(el.offsetHeight) : 0}px`);
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

  // Scroll progress: the line grows from left to right as the page is read (transform only, so it never moves the layout).
  useEffect(() => {
    const bar = progress.current;
    if (!bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="absolute h-px w-px" />
      <header
        ref={header}
        data-scrolled={scrolled}
        className="group/hdr sticky top-0 z-40 [@media(max-height:520px)]:static border-b border-border bg-bg text-ink transition-shadow duration-300 data-[scrolled=true]:shadow-[0_6px_20px_-12px_rgb(16_24_40/0.3)]"
      >
        {children}
      </header>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
        <div ref={progress} className="h-full origin-left bg-brand-500" style={{ transform: "scaleX(0)" }} />
      </div>
    </>
  );
}
