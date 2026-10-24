"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/**
 * The hero's product stage. It publishes how far the hero has scrolled away as --sp (0 at rest, 1 once the hero has
 * left the screen), so the product turns, rises and shrinks as the visitor scrolls, on top of the hero's cursor
 * parallax (--mx / --my). Reduced motion keeps --sp at 0.
 *
 * 3D model slot: this stage shows a studio photo for now. When GLB models are supplied (public/models/*.glb), the
 * <Image> below is the single place to swap for a 3D model viewer; the stage, rings and motion stay as they are.
 */
export function StoryStage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const section = el?.closest("section");
    if (!el || !section || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = section.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      el.style.setProperty("--sp", p.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none relative mx-auto aspect-square w-[min(78vw,22rem)] md:w-[min(40vw,34rem)]">
      {/* Orbit rings in perspective, a warm glow and the floor shadow. */}
      <span className="absolute inset-[-18%] rounded-full bg-[radial-gradient(circle,rgb(255_92_0/0.18),transparent_62%)] blur-2xl" />
      <span className="absolute inset-x-[-22%] top-[58%] aspect-square -translate-y-1/2 rounded-full border border-brand-500/45 [transform:perspective(900px)_rotateX(76deg)]">
        <span className="absolute inset-0 animate-[spin_14s_linear_infinite] rounded-full">
          <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500 shadow-[0_0_16px_4px_rgb(255_92_0/0.55)]" />
        </span>
      </span>
      <span className="absolute inset-x-[-6%] top-[58%] aspect-square -translate-y-1/2 rounded-full border border-dashed border-ink/15 [transform:perspective(900px)_rotateX(76deg)]" />
      <span className="absolute bottom-[6%] left-1/2 h-6 w-[46%] -translate-x-1/2 rounded-[50%] bg-ink/30 blur-xl [transform:scaleX(calc(1-var(--sp,0)*0.35))]" />
      {/* The product: idle float, cursor parallax and scroll-driven turn / rise / shrink. */}
      <div className="absolute inset-0 [transform:translate3d(calc(var(--mx,0)*18px),calc(var(--my,0)*12px+var(--sp,0)*-9vh),0)_rotate(calc(-7deg+var(--sp,0)*16deg))_scale(calc(1-var(--sp,0)*0.2))]">
        <div className="absolute inset-0 animate-float [--dur:8s]">
          <div className="absolute inset-[6%] mix-blend-multiply [mask-image:radial-gradient(closest-side,#000_68%,transparent)]">
            <Image src={src} alt={alt} fill priority sizes="(min-width:768px) 34rem, 78vw" className="object-cover [filter:brightness(1.08)_contrast(1.05)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
