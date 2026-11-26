"use client";

import Image from "next/image";
import { createContext, useContext, useMemo } from "react";
import { formatLkr } from "@/lib/utils/money";

/** Payzy splits a purchase into 4 monthly payments. */
export const PAYZY_PARTS = 4;

const PartsContext = createContext({ parts: 0, payzy: false });

/** Set once in the store layout; every product card, page and quick view reads the same value. */
export function KokoPartsProvider({ parts, payzy = false, children }: { parts: number; payzy?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ parts, payzy }), [parts, payzy]);
  return <PartsContext.Provider value={value}>{children}</PartsContext.Provider>;
}

export const useKokoParts = () => useContext(PartsContext).parts;

/**
 * Koko and Payzy each get their own line: "or 3 x LKR 4,167 with [Koko]" and "or 4 x LKR 3,125 monthly with [Payzy]". A line
 * only shows when that provider is really offered at checkout.
 */
export function KokoInstalment({ price, parts: override = 0, className = "mt-0.5 text-[13px] text-muted" }: { price: number; parts?: number; className?: string }) {
  const ctx = useContext(PartsContext);
  const parts = override || ctx.parts;
  if (!(price > 0) || (parts < 2 && !ctx.payzy)) return null;
  // The second line sits a little below the first whatever top margin the caller gave the first one.
  const second = className.replace(/(^|\s)-?mt-[\d.]+/g, " mt-1").trim();
  return (
    <>
      {parts >= 2 && (
        <p className={className}>
          or {parts} x {formatLkr(Math.ceil(price / parts))} with <Image src="/images/koko-logo.png" alt="Koko" width={240} height={74} className="ml-0.5 inline-block h-[15px] w-auto align-[-3px]" />
        </p>
      )}
      {ctx.payzy && (
        <p className={parts >= 2 ? second : className}>
          or {PAYZY_PARTS} x {formatLkr(Math.ceil(price / PAYZY_PARTS))} monthly with <Image src="/images/payzy-logo.png" alt="Payzy" width={260} height={72} className="ml-0.5 inline-block h-[14px] w-auto align-[-3px]" />
        </p>
      )}
    </>
  );
}

/** The payments a purchase is split into, shown under the chosen method at checkout. The last one absorbs the rounding. */
export function KokoInstalmentSchedule({ total, parts, monthly }: { total: number; parts: number; monthly: boolean }) {
  const each = Math.ceil(total / parts);
  const rows = Array.from({ length: parts }, (_, i) => (i < parts - 1 ? each : Math.max(0, Math.round((total - each * (parts - 1)) * 100) / 100)));
  return (
    <div className="mx-4 mb-4 rounded-lg bg-white/70 ring-1 ring-border">
      <p className="px-3 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Your {parts} {monthly ? "monthly " : ""}payments</p>
      <ol className="divide-y divide-border px-3 pb-1">
        {rows.map((amount, i) => (
          <li key={i} className="flex items-center justify-between py-2.5">
            <span className="flex items-center gap-2.5 text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-on-brand">{i + 1}</span>
              {i === 0 ? "Pay today" : `Instalment ${i + 1}`}
            </span>
            <span className="font-semibold tabular-nums text-ink">{formatLkr(amount)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
