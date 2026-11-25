"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { VideoConfig } from "@/lib/home-config";
import { ProductCarousel } from "./product-carousel";

/**
 * Owner-configured videos (HOME_VIDEOS). Each card shows a thumbnail and a play button; the YouTube player (privacy-enhanced
 * youtube-nocookie.com) is only created after the visitor presses play, so no third-party code loads with the page.
 */
export function VideoShowcase({ title, videos }: { title: string; videos: VideoConfig[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (!videos.length) return null;
  return (
    <section aria-labelledby="videos" className="container-page mt-10 sm:mt-14">
      <h2 id="videos" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">{title}</h2>
      {/* Every video is in one row you can scroll freely (swipe, trackpad, arrows). A piece of the next video shows, so it is clear there is more. */}
      <ProductCarousel label="Videos" align="start" step="item" snap="proximity">
        {videos.map((v) => {
          const on = playing === v.id;
          return (
            <li key={v.id} className="w-[82%] shrink-0 snap-start px-2 sm:w-[46%] lg:w-[36%]">
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-ink">
                {on ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`}
                    title={v.title}
                    className="absolute inset-0 h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <button type="button" onClick={() => setPlaying(v.id)} aria-label={`Play video: ${v.title}`} className="group absolute inset-0 block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, loaded lazily */}
                    <img
                      src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 motion-reduce:transition-none motion-reduce:group-hover:scale-100 group-hover:scale-[1.03]"
                    />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 text-on-brand shadow-lg transition-transform motion-reduce:transition-none motion-reduce:group-hover:scale-100 group-hover:scale-110 group-focus-visible:scale-110">
                      <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
                    </span>
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold leading-snug">{v.title}</p>
              {v.channel && <p className="text-xs text-muted">{v.channel}</p>}
            </li>
          );
        })}
      </ProductCarousel>
    </section>
  );
}
