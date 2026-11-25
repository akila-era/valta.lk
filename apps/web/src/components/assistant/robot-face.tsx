"use client";

import { useId } from "react";

export type FaceState = "idle" | "listening" | "thinking" | "speaking";

/**
 * VOLTA AI's face. Original circuit-style artwork drawn as inline SVG (no image file).
 * idle: slow glow and blinking. listening: eyes pulse fast. thinking: eyes flicker. speaking: mouth and jaw move.
 * `still` freezes it (used for small avatars next to messages).
 */
export function RobotFace({ state = "idle", still = false, className = "" }: { state?: FaceState; still?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const eyeSpeed = state === "listening" ? "0.7s" : state === "thinking" ? "0.45s" : undefined;
  const eyeAnim = still ? "" : "animate-ai-eye";
  const talking = state === "speaking" && !still;
  const line = "#4a97b6";

  return (
    <svg viewBox="0 0 200 262" className={className} role="img" aria-label="VOLTA AI">
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef9fc" />
          <stop offset="1" stopColor="#86bfd6" />
        </linearGradient>
        <radialGradient id={`${id}e`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#8cf3ff" />
          <stop offset="1" stopColor="#22c5e6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* head */}
      <path d="M100 6C152 6 186 50 186 116C186 190 152 256 100 256C48 256 14 190 14 116C14 50 48 6 100 6Z" fill={`url(#${id}h)`} stroke="#2e7592" strokeWidth="3" />
      {/* forehead + side plates */}
      <path d="M72 14H128V70Q128 84 116 88H84Q72 84 72 70Z" fill="#c4e8f2" stroke="#2e7592" strokeWidth="2" />
      <path d="M40 42L66 20V98L40 112Z" fill="#f1fafc" stroke="#2e7592" strokeWidth="2" />
      <path d="M160 42L134 20V98L160 112Z" fill="#f1fafc" stroke="#2e7592" strokeWidth="2" />
      {/* circuit traces */}
      <g fill="none" stroke={line} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M86 20V58M100 20V74M114 20V58" />
        <path d="M30 70H46V88H58M26 96H40M52 36V70M60 50V84" />
        <path d="M170 70H154V88H142M174 96H160M148 36V70M140 50V84" />
        <path d="M34 150H52L62 162M30 172H50M26 130H38" />
        <path d="M166 150H148L138 162M170 172H150M174 130H162" />
      </g>
      <g fill={line}>
        {[[86, 58], [100, 74], [114, 58], [30, 70], [58, 88], [26, 96], [170, 70], [142, 88], [174, 96], [34, 150], [30, 172], [166, 150], [170, 172]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" />
        ))}
      </g>
      {/* cheek plates */}
      <path d="M30 148L64 164L74 208L46 196Z" fill="#9ccbdd" stroke="#2e7592" strokeWidth="2" />
      <path d="M170 148L136 164L126 208L154 196Z" fill="#9ccbdd" stroke="#2e7592" strokeWidth="2" />
      {/* brows */}
      <path d="M32 106Q62 88 92 104V114Q62 102 32 116Z" fill="#1d5c79" />
      <path d="M168 106Q138 88 108 104V114Q138 102 168 116Z" fill="#1d5c79" />
      {/* eyes */}
      <g className={still ? "" : "animate-ai-blink"}>
        {[64, 136].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy="130" rx="27" ry="14" fill="#12495f" />
            <ellipse cx={cx} cy="130" rx="20" ry="10" fill="#e2f8fc" />
            <g className={eyeAnim} style={eyeSpeed ? { animationDuration: eyeSpeed } : undefined}>
              <circle cx={cx} cy="130" r="15" fill={`url(#${id}e)`} />
              <circle cx={cx} cy="130" r="6.5" fill="#7ceeff" />
              <circle cx={cx} cy="130" r="3" fill="#ffffff" />
            </g>
          </g>
        ))}
      </g>
      {/* nose */}
      <path d="M92 98H108L111 152H89Z" fill="#f3fbfd" stroke="#2e7592" strokeWidth="2" />
      <path d="M84 166Q100 182 116 166Q116 178 100 186Q84 178 84 166Z" fill="#2e7592" />
      {/* chin plate stays put; only the lower lip drops */}
      <path d="M80 242H120L110 254H90Z" fill="#c4e8f2" stroke="#2e7592" strokeWidth="2" />
      {/* mouth: a dark cavity with a glowing core opens behind the lips while speaking */}
      <g className={talking ? "animate-ai-talk" : ""} style={talking ? undefined : { transform: "scaleY(0.08)", transformBox: "fill-box", transformOrigin: "center" }}>
        <ellipse cx="100" cy="212" rx="27" ry="15" fill="#0c3446" />
        <ellipse cx="100" cy="216" rx="15" ry="6" fill="#22c5e6" opacity="0.75" />
      </g>
      <g className={talking ? "animate-ai-jaw" : ""}>
        <path d="M76 209Q100 228 124 209Q112 234 100 234Q88 234 76 209Z" fill="#a3d6e6" stroke="#2e7592" strokeWidth="2" />
      </g>
      <g className={talking ? "animate-ai-lip" : ""}>
        <path d="M72 206Q86 198 100 202Q114 198 128 206Q114 210 100 209Q86 210 72 206Z" fill="#7dbfd5" stroke="#2e7592" strokeWidth="2" />
      </g>
    </svg>
  );
}
