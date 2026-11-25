"use client";

import Image from "next/image";
import { createContext, useContext, useMemo } from "react";
import { formatLkr } from "@/lib/utils/money";

/** Payzy splits a purchase into 4 monthly payments. */
const PAYZY_PARTS = 4;

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
