"use client";

import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";

/**
 * Thumbnail for an ordered item. `src` is optional on purpose: orders saved locally before the ERP confirms them carry no
 * image, and a catalogue image can fail to load. Both cases show the same neutral placeholder, never a broken image.
 */
export function OrderThumb({ src, sizes = "64px", className = "" }: { src?: string; sizes?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-surface text-muted ${className}`}>
      {src && !failed ? <Image src={src} alt="" fill sizes={sizes} onError={() => setFailed(true)} className="object-contain p-1.5" /> : <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
    </span>
  );
}
