"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The line in the top bar. It is shown once, still, when it fits. Only when it is too long for the space (a long owner
 * announcement on a narrow screen) does it scroll, with a second copy so the loop is seamless. Reduced motion stops the
 * scrolling (see the global rule), and the second copy is hidden from screen readers.
 */
export function AnnouncementLine({ text }: { text: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(false);

  useEffect(() => {
    const w = wrap.current;
    const r = ruler.current;
    if (!w || !r || typeof ResizeObserver === "undefined") return;
    // Runs once when observing starts and again whenever the space or the text's width changes (fonts, resizing).
    const ro = new ResizeObserver(() => setScroll(r.offsetWidth > w.clientWidth + 1));
    ro.observe(w);
    ro.observe(r);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={wrap} className="relative min-w-0 overflow-hidden">
      {/* Invisible copy that only measures how wide the text really is. */}
      <span ref={ruler} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{text}</span>
      {scroll ? (
        <span className="flex w-max animate-marquee gap-16 whitespace-nowrap [--marquee-dur:16s]">
          <span>{text}</span>
          <span aria-hidden>{text}</span>
        </span>
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </div>
  );
}
