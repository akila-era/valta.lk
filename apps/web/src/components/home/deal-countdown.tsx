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
    <div className="-mt-2 mb-9 flex min-h-[4.5rem] flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:-mt-3 sm:mb-11 sm:min-h-[5.5rem]">
      {now != null ? <span className="sr-only">Deals end {endText}.</span> : null}
      {left == null ? null : left <= 0 ? (
        <p aria-hidden className="text-sm font-semibold text-muted">These deals have ended. Refresh for the latest prices.</p>
      ) : (
        <>
          <span aria-hidden className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-ink sm:text-base">
            <Clock className="h-5 w-5 text-brand-500 sm:h-6 sm:w-6" aria-hidden /> Ends in
          </span>
          <span aria-hidden className="flex items-center gap-1.5 sm:gap-2.5">
            {units.map((u, i) => (
              <span key={u.l} className="flex items-center gap-1.5 sm:gap-2.5">
                {i > 0 ? <span className="text-xl font-extrabold text-ink/30 sm:text-2xl">:</span> : null}
                <span className="flex min-w-[3.75rem] flex-col items-center rounded-card bg-ink px-2.5 py-2.5 leading-none text-white shadow-[0_8px_20px_-10px_rgb(0_0_0/0.5)] sm:min-w-[4.75rem] sm:py-3">
                  <span className="font-display text-2xl font-extrabold tabular-nums text-brand-500 sm:text-[2rem]">{u.v}</span>
                  <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:text-[11px]">{u.l}</span>
                </span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}
