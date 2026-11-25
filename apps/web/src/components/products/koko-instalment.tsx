"use client";

import { createContext, useContext } from "react";
import { formatLkr } from "@/lib/utils/money";

const PartsContext = createContext(0);

/** Set once in the store layout; every product card, page and quick view reads the same value. */
export function KokoPartsProvider({ parts, children }: { parts: number; children: React.ReactNode }) {
  return <PartsContext.Provider value={parts}>{children}</PartsContext.Provider>;
}

export const useKokoParts = () => useContext(PartsContext);

/** "or 3 x LKR 4,167 with Koko". Renders nothing when Koko is not offered. */
export function KokoInstalment({ price, parts: override = 0, className = "mt-0.5 text-[13px] text-muted" }: { price: number; parts?: number; className?: string }) {
  const fromContext = useKokoParts();
  const parts = override || fromContext;
  if (parts < 2 || !(price > 0)) return null;
  return (
    <p className={className}>
      or {parts} x {formatLkr(Math.ceil(price / parts))} with <span className="font-semibold text-ink">Koko</span>
    </p>
  );
}
