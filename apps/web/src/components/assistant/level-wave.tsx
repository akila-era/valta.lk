"use client";

const SHAPE = [0.45, 0.7, 0.55, 0.9, 1, 0.8, 0.6, 0.75, 0.5];

/**
 * Live microphone meter: the bars rise and fall with the real sound level coming from the microphone.
 * When nothing is coming in, the bars stay flat, so a silent or wrong microphone is visible straight away.
 */
export function Wave({ level = null, tone = "brand" }: { level?: number | null; tone?: "brand" | "light" }) {
  return (
    <span className="flex h-6 items-center gap-[3px]" aria-hidden>
      {SHAPE.map((k, i) => (
        <span
          key={i}
          className={`h-full w-[3px] origin-center rounded-full ${level == null ? "animate-ai-bar" : "transition-transform duration-100"} ${tone === "light" ? "bg-[#5fcf93]" : "bg-brand-500"}`}
          style={level == null ? { animationDelay: `${(i % 5) * 0.1}s` } : { transform: `scaleY(${Math.max(0.12, Math.min(1, level * k * 1.4))})` }}
        />
      ))}
    </span>
  );
}
