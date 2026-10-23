"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Sticky header wrapper that gains a soft shadow once the page has scrolled. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

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
        data-scrolled={scrolled}
        className="group/hdr sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-md transition-shadow duration-200 data-[scrolled=true]:shadow-raised"
      >
        {children}
      </header>
    </>
  );
}
