"use client";

import Image from "next/image";
import { useState } from "react";
import { Zap } from "lucide-react";

function EmptyPhoto({ alt }: { alt: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface" role="img" aria-label={alt ? `${alt} (no image available)` : "No image available"}>
      <Zap className="h-1/4 w-1/4 min-h-6 min-w-6 fill-current text-neutral-300" strokeWidth={1} aria-hidden />
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
