"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/**
 * The hero <section> as a 3D "camera": with a fine pointer, the cursor position is published as --mx / --my (-1..1,
 * eased with requestAnimationFrame) and each layer translates or tilts by its own depth. Touch screens and visitors
 * who ask for reduced motion get the still composition (both stay at 0).
 */
export function HeroDepth({ children, ...props }: ComponentPropsWithoutRef<"section">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.setProperty("--mx", x.toFixed(3));
      el.style.setProperty("--my", y.toFixed(3));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      start();
    };
    const leave = () => {
      tx = 0;
      ty = 0;
      start();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={ref} {...props}>
      {children}
    </section>
  );
}
