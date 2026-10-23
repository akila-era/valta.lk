"use client";

import { ChevronUp } from "lucide-react";

/** Scrolls to the top of the page. Smooth scrolling is skipped when the visitor prefers reduced motion. */
export function BackToTop() {
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <ChevronUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
