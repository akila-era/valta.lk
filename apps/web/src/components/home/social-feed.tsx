"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { SocialPost } from "@/lib/home-extras";

const NAMES = { instagram: "Instagram", tiktok: "TikTok" } as const;

function Glyph({ platform, className }: { platform: SocialPost["platform"]; className?: string }) {
  return platform === "instagram" ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 4v9.2a3.7 3.7 0 1 1-3.7-3.7M15 4c.3 2.3 1.9 3.9 4.2 4.1" />
    </svg>
  );
}

/**
 * Social posts the owner picked (Instagram and TikTok). Each card is local, so nothing from Instagram or TikTok loads with the
 * page; the official player is created only after the visitor presses play, and the post always has a link to the original.
 */
export function SocialFeed({ posts, profiles }: { posts: SocialPost[]; profiles: { label: string; href: string }[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (!posts.length) return null;
  return (
    <section aria-labelledby="social-title" className="container-page mt-10 sm:mt-14">
      <div className="mb-6 text-center sm:mb-8">
        <h2 id="social-title" className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem]">Follow Us on Social</h2>
        {profiles.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {profiles.map((p) => (
              <a key={p.label} href={p.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold text-ink transition-colors hover:border-ink">
                {p.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ))}
          </p>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {posts.map((p) => {
          const on = playing === p.id;
          const insta = p.platform === "instagram";
          return (
            <li key={p.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-ink">
                {on ? (
                  <iframe
                    src={p.embedUrl}
                    title={`${NAMES[p.platform]}: ${p.caption}`}
                    className="absolute inset-0 h-full w-full bg-white"
                    loading="lazy"
                    allow="encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(p.id)}
                    aria-label={`Load ${NAMES[p.platform]} post: ${p.caption}`}
                    className={`group absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white ${insta ? "bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]" : "bg-gradient-to-br from-[#111] via-[#1f1f1f] to-[#25f4ee]/40"}`}
                  >
                    <Glyph platform={p.platform} className="h-14 w-14 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none" />
                    <span className="line-clamp-3 text-[15px] font-semibold leading-snug">{p.caption}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">
                      <Play className="h-4 w-4 fill-current" aria-hidden /> Watch here
                    </span>
                  </button>
                )}
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[13px] text-muted hover:text-ink hover:underline">
                <Glyph platform={p.platform} className="h-4 w-4" /> View on {NAMES[p.platform]}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
