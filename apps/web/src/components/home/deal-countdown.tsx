"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

/** The current second, as an external store: ticks once a second in the browser, null on the server. */
const subscribe = (cb: () => void) => {
  const t = window.setInterval(cb, 1000);
  return () => window.clearInterval(t);
};
const nowSecond = () => Math.floor(Date.now() / 1000) * 1000;

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * "Deals end in 2d 05:12:44": a live countdown to the real end date staff set on the Hot Deals (admin), ticking every
 * second. It is drawn only in the browser (the server cannot know the visitor's "now", and a time rendered there
 * would not match), with the space kept so nothing jumps. When the time is up it says so instead of showing zeros.
 * Screen readers get the end time once, not a ticking clock.
 */
export function DealCountdown({ endsAt }: { endsAt: string }) {
  const end = Date.parse(endsAt);
  const now = useSyncExternalStore(subscribe, nowSecond, () => null);

  const left = now == null ? null : end - now;
  const p = parts(left ?? 0);
  const units = [
    ...(p.d > 0 ? [{ v: String(p.d), l: p.d === 1 ? "day" : "days" }] : []),
    { v: pad(p.h), l: "hrs" },
    { v: pad(p.m), l: "min" },
    { v: pad(p.s), l: "sec" },
  ];
  // Formatted only in the browser (below), in the visitor's own time zone.
  const endText = now == null ? "" : new Date(end).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="-mt-3 mb-7 flex min-h-[2.5rem] flex-wrap items-center justify-center gap-2.5 sm:-mt-4 sm:mb-8">
      {now != null ? <span className="sr-only">Deals end {endText}.</span> : null}
      {left == null ? null : left <= 0 ? (
        <p aria-hidden className="text-sm font-semibold text-muted">These deals have ended. Refresh for the latest prices.</p>
      ) : (
        <>
          <span aria-hidden className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
            <Clock className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Ends in
          </span>
          <span aria-hidden className="flex items-center gap-1">
            {units.map((u, i) => (
              <span key={u.l} className="flex items-center gap-1">
                {i > 0 ? <span className="text-sm font-bold text-ink/30">:</span> : null}
                <span className="flex min-w-[2.5rem] flex-col items-center rounded-md bg-ink px-1.5 py-1 leading-none text-white">
                  <span className="font-display text-[15px] font-extrabold tabular-nums text-brand-500">{u.v}</span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/70">{u.l}</span>
                </span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
