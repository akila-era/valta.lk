"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Countdown to the sale end time the owner entered in the admin (the ERP carries no end date). It starts after the page loads so
 * server and browser never disagree, and it removes itself when the time is up. The numbers are announced politely once a minute.
 */
export function Countdown({ endsAt, label }: { endsAt: string; label: string }) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  if (now === null) return <span className="inline-block h-9 w-48" aria-hidden />;
  const left = end - now;
  if (!(left > 0)) return null;
  const p = parts(left);
  const cell = (v: number, unit: string) => (
    <span className="flex min-w-11 flex-col items-center rounded-lg bg-ink px-2 py-1 text-white">
      <span className="text-lg font-semibold leading-none tabular-nums">{String(v).padStart(2, "0")}</span>
      <span className="mt-0.5 text-[11px] uppercase leading-none tracking-wide text-white/60">{unit}</span>
    </span>
  );
  const spoken = `${p.d > 0 ? `${p.d} days ` : ""}${p.h} hours ${p.m} minutes`;
  return (
    <div className="flex flex-wrap items-center gap-2.5" role="timer" aria-label={`${label} ${spoken}`}>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sale">
        <Timer className="h-4 w-4" aria-hidden /> {label}
      </span>
      <span className="flex items-center gap-1.5" aria-hidden>
        {p.d > 0 && cell(p.d, "days")}
        {cell(p.h, "hrs")}
        {cell(p.m, "min")}
        {cell(p.s, "sec")}
      </span>
    </div>
  );
}
