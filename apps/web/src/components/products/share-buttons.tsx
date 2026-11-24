"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";

/** Share a product: the phone's share sheet when there is one, WhatsApp, Facebook, and copy link. */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser: false on the server, the real answer once hydrated.
  const canShare = useSyncExternalStore(() => () => {}, () => "share" in navigator, () => false);
  const item = "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-ink transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-on-brand";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the link stays in the address bar */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Share</span>
      {canShare ? (
        <button type="button" className={item} aria-label="Share this product" onClick={() => void navigator.share({ title, url }).catch(() => {})}>
          <Share2 className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <a className={item} href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp (opens in a new tab)">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.1.82.83-3-.2-.31a8.2 8.2 0 1 1 6.97 3.82Z" />
        </svg>
      </a>
      <a className={item} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook (opens in a new tab)">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.25-1.5 1.5-1.5H16.5V4.4A20 20 0 0 0 14.3 4.3c-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9Z" /></svg>
      </a>
      <button type="button" className={item} aria-label={copied ? "Link copied" : "Copy link"} onClick={() => void copy()}>
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
