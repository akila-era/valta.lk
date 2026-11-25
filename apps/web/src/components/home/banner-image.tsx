"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Picture for a promotional banner. If the file is missing or fails to load, the banner keeps its shape and shows the
 * VOLTA mark as a quiet watermark, so a broken upload never leaves a hole or a broken-image icon. Nothing is invented.
 */
export function BannerImage({ src, alt = "", sizes, unoptimized, priority, className = "object-cover", tone = "dark" }: { src: string; alt?: string; sizes: string; unoptimized?: boolean; priority?: boolean; className?: string; tone?: "dark" | "light" }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={`flex h-full w-full items-center justify-center overflow-hidden ${tone === "dark" ? "bg-ink" : "bg-surface"}`}>
        <span aria-hidden className={`select-none text-[10rem] font-black leading-none tracking-tighter ${tone === "dark" ? "text-white/[0.06]" : "text-ink/[0.05]"}`}>Λ</span>
      </div>
    );
  }
  return <Image src={src} alt={alt} fill unoptimized={unoptimized} sizes={sizes} priority={priority} loading={priority ? undefined : "lazy"} onError={() => setFailed(true)} className={className} />;
}
