"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

/**
 * The animated chatbot icon (public/ai/ai-chatbot.json). The light Lottie player is loaded only when this mounts,
 * and the animation stays on its first frame for people who prefer reduced motion. Until it loads, a sparkle icon shows.
 */
export function AiLottie({ className = "" }: { className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const fallback = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let anim: { destroy(): void } | undefined;
    let cancelled = false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (cancelled || !box.current) return;
      const a = lottie.loadAnimation({ container: box.current, renderer: "svg", loop: true, autoplay: !still, path: "/ai/ai-chatbot.json" });
      a.addEventListener("DOMLoaded", () => {
        if (fallback.current) fallback.current.style.display = "none";
        if (still) a.goToAndStop(0, true);
      });
      anim = a;
    });
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, []);

  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden>
      <span ref={fallback} className="absolute inset-0 flex items-center justify-center text-brand-600">
        <Sparkles className="h-1/2 w-1/2" strokeWidth={1.75} />
      </span>
      <span ref={box} className="block h-full w-full" />
    </span>
  );
}
