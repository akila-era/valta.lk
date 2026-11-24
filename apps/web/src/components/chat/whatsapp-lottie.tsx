"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

/**
 * The animated icon of the floating WhatsApp button: the store's own Lottie animation
 * (src/asset/whtsapp-icon/whtsapp icon.json), played in a loop. The player and the animation are loaded after the
 * page, so they never slow the first paint. The animation's canvas has empty space around the figure, so the view is
 * cropped to the figure (VIEW) to fill the round button. With reduced motion it shows one still frame.
 */
const VIEW = "18 36 326 277"; // x y width height of the figure across all frames (measured)
const STILL_FRAME = 40;

export function WhatsAppLottie({ className = "" }: { className?: string }) {
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let anim: AnimationItem | null = null;
    let cancelled = false;
    (async () => {
      const [{ default: lottie }, data] = await Promise.all([import("lottie-web/build/player/lottie_light"), import("@/asset/whtsapp-icon/whtsapp icon.json")]);
      if (cancelled || !box.current) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anim = lottie.loadAnimation({
        container: box.current,
        renderer: "svg",
        loop: true,
        autoplay: !still,
        animationData: JSON.parse(JSON.stringify(data.default ?? data)),
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
      anim.addEventListener("DOMLoaded", () => {
        box.current?.querySelector("svg")?.setAttribute("viewBox", VIEW);
        if (still) anim?.goToAndStop(STILL_FRAME, true);
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, []);

  return <span ref={box} aria-hidden className={`pointer-events-none block [&>svg]:!h-full [&>svg]:!w-full ${className}`} />;
}
