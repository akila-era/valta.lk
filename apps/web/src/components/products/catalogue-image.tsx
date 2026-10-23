"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";

function EmptyPhoto({ alt }: { alt: string }) {
  const label = alt ? `${alt} (no image available)` : "No image available";
  return (
    <div className="@container flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-surface to-border/60 text-muted/70" role="img" aria-label={label}>
      <span className="flex items-center justify-center rounded-full @[8rem]:h-14 @[8rem]:w-14 @[8rem]:bg-bg/80 @[8rem]:shadow-card" aria-hidden>
        <ImageOff className="h-5 w-5 @[8rem]:h-6 @[8rem]:w-6" strokeWidth={1.5} />
      </span>
      <span className="hidden text-[11px] font-semibold uppercase tracking-[0.16em] @[8rem]:block" aria-hidden>No photo</span>
    </div>
  );
}

/** Shows a catalogue image, or a quiet empty state when the ERP has none or the file fails to load. */
export function CatalogueImage({ src, alt, sizes, priority, contain = true, padding = "p-4", onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; padding?: string; onError?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <EmptyPhoto alt={alt} />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
      className={contain ? `object-contain ${padding}` : "object-cover"}
    />
  );
}
