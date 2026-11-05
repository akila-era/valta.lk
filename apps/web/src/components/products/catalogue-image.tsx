"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
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

const noSubscribe = () => () => {};

/** Shows a catalogue image, or a quiet empty state when the ERP has none or the file fails to load. */
export function CatalogueImage({ src, alt, sizes, priority, contain = true, padding = "p-4", onError }: { src?: string; alt: string; sizes: string; priority?: boolean; contain?: boolean; padding?: string; onError?: () => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // false on the server and while hydrating (so the server picture is shown as is), true afterwards: only pictures that
  // load after the page is live fade in, and a priority picture (the first ones on screen) never waits for a fade.
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  const fade = live && !priority;
  if (!src || failed) return <EmptyPhoto alt={alt} />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
      className={`${contain ? `object-contain ${padding}` : "object-cover"} ${fade ? `transition-[opacity,scale] duration-500 ease-out motion-reduce:transition-none ${loaded ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"}` : ""}`}
    />
  );
}
