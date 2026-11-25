"use client";

import Image from "next/image";
import { createContext, useContext, useMemo } from "react";
import { formatLkr } from "@/lib/utils/money";

const PartsContext = createContext({ parts: 0, payzy: false });

/** Set once in the store layout; every product card, page and quick view reads the same value. */
export function KokoPartsProvider({ parts, payzy = false, children }: { parts: number; payzy?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ parts, payzy }), [parts, payzy]);
  return <PartsContext.Provider value={value}>{children}</PartsContext.Provider>;
}

export const useKokoParts = () => useContext(PartsContext).parts;

/** "or 3 x LKR 4,167 with Koko", plus the Payzy logo when Payzy is also offered. Renders nothing when neither is offered. */
export function KokoInstalment({ price, parts: override = 0, className = "mt-0.5 text-[13px] text-muted" }: { price: number; parts?: number; className?: string }) {
  const ctx = useContext(PartsContext);
  const parts = override || ctx.parts;
  if (!(price > 0) || (parts < 2 && !ctx.payzy)) return null;
  const payzy = ctx.payzy && <Image src="/images/payzy-logo.png" alt="Payzy" width={260} height={72} className="inline-block h-[14px] w-auto align-[-3px]" />;
  // Payzy plans are not described with a number here: only the logo, so nothing is promised that checkout does not show.
  if (parts < 2) return <p className={className}>Instalments with {payzy}</p>;
  return (
    <p className={className}>
      or {parts} x {formatLkr(Math.ceil(price / parts))} with <Image src="/images/koko-logo.png" alt="Koko" width={240} height={74} className="ml-0.5 inline-block h-[15px] w-auto align-[-3px]" />{payzy && <> <span className="text-muted">or</span> {payzy}</>}
    </p>
  );
}
