"use client";

import { useEffect, useState } from "react";
import { BrandLoaderMark } from "@/components/ui/brand-loader";

/** The splash stays at least this long, a short beat, so the wordmark is seen rather than flashed. */
const MIN_MS = 1600;
/** Length of the fade-out (matches duration-300 below). */
const LEAVE_MS = 300;

/**
 * Opening screen on a full page load: neon orange, with the white VOLTA.LK wordmark, until the page has loaded. It is in
 * the server HTML, so it covers the page from the first paint; it then fades out and is removed. Moving between pages
 * inside the site does not show it again (those use the route loaders). If scripts never run, a CSS animation hides
 * it after a few seconds (the `splash-auto-out` class), so it can never trap the visitor.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");

  useEffect(() => {
    let leave = 0;
    let gone = 0;
    const done = () => {
      leave = window.setTimeout(() => {
        setPhase("leave");
        gone = window.setTimeout(() => setPhase("gone"), LEAVE_MS);
      }, Math.max(0, MIN_MS - performance.now()));
    };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={phase === "leave"}
      className={`splash-auto-out fixed inset-0 z-[100] flex items-center justify-center bg-brand-500 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <BrandLoaderMark onBrand />
      <span className="sr-only">Loading VOLTA.LK</span>
    </div>
  );
}
