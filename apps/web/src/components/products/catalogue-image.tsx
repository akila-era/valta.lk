"use client";

import Image from "next/image";
import { useState } from "react";

function EmptyPhoto({ alt }: { alt: string }) {
  const label = alt ? `${alt} (no image available)` : "No image available";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface text-muted" role="img" aria-label={label}>
      <span className="h-px w-10 bg-border" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">No photo</span>
    </div>
  );
}

/** Shows a catalogue image, or a quiet empty state when the ERP has none or the file fails to load. */
export function CatalogueImage({ src, alt, sizes, priority, contain = true, onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; onError?: () => void }) {
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
      className={contain ? "object-contain p-4" : "object-cover"}
    />
  );
}
