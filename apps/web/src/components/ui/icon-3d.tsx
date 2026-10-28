import type { ComponentType } from "react";

type Icon = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const TONE = {
  /* Solid neon orange block; black icon (>= 5:1). */
  brand: "bg-brand-500 text-on-brand",
  /* Frosted glass block with a text-safe orange icon. */
  glass:
    "bg-white/85 text-brand-600 ring-1 ring-ink/[0.06] backdrop-blur shadow-[inset_0_1px_0_#fff,0_12px_24px_-12px_rgb(27_23_20/0.4)]",
} as const;

const SIZE = {
  sm: { box: "h-9 w-9 rounded-[0.7rem]", icon: "h-[1.1rem] w-[1.1rem]" },
  md: { box: "h-11 w-11 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "h-14 w-14 rounded-2xl", icon: "h-6 w-6" },
} as const;

/**
 * A small 3D icon tile: tilted in perspective at rest, it turns to face the viewer and lifts when its `group` parent
 * is hovered (no motion with reduced motion). Decorative: the icon is aria-hidden, the parent carries the label.
 */
export function Icon3D({ icon: I, tone = "brand", size = "md", className = "" }: { icon: Icon; tone?: keyof typeof TONE; size?: keyof typeof SIZE; className?: string }) {
  const s = SIZE[size];
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center ${s.box} ${TONE[tone]} transition-transform duration-300 ease-out [transform:perspective(420px)_rotateX(14deg)_rotateY(-16deg)] group-hover:[transform:perspective(420px)_translateY(-3px)] motion-reduce:transition-none ${className}`}
    >
      <I className={s.icon} strokeWidth={1.9} aria-hidden />
    </span>
  );
}
