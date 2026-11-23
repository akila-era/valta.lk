"use client";

import { useEffect, useRef, useState } from "react";
import { lineKey } from "@/lib/utils/cart-math";
import { cartActions, useCart } from "@/store/cart";

export interface LiveLine {
  productId: string;
  variantKey: string;
  available: boolean;
  unitPrice: number | null;
  listPrice: number | null;
  offerName: string | null;
  maxQuantity: number | null;
}

export interface CheckoutInfo {
  enabled: boolean;
  deliveryCharge: number | null;
}

/**
 * Fetches live availability/prices from the server (which asks the ERP) so the cart reflects ERP state, never only stale
 * local data. Price changes are applied to the cart and remembered as notices so the customer sees what changed.
 */
export function useLiveCart() {
  const { lines } = useCart();
  const [live, setLive] = useState<LiveLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [priceNotes, setPriceNotes] = useState<Record<string, { from: number; to: number }>>({});
  const [attempt, setAttempt] = useState(0);
  const signature = lines.map((l) => `${lineKey(l)}x${l.quantity}`).join("|");
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines; // read inside the fetch callback; effects run in order, so this is current when it fires
  });

  useEffect(() => {
    if (!lines.length) return;
    const ctl = new AbortController();
    fetch("/api/store/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })) }),
      signal: ctl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { lines: LiveLine[] };
        setLive(data.lines);
        setFailed(false);
        const current = linesRef.current;
        const changed = data.lines.filter((d) => d.unitPrice != null).map((d) => ({ productId: d.productId, variantKey: d.variantKey, unitPrice: d.unitPrice as number }));
        const notes: Record<string, { from: number; to: number }> = {};
        for (const c of changed) {
          const l = current.find((x) => x.productId === c.productId && x.variantKey === c.variantKey);
          if (l && l.unitPrice !== c.unitPrice) notes[lineKey(l)] = { from: l.unitPrice, to: c.unitPrice };
        }
        if (Object.keys(notes).length) {
          setPriceNotes((p) => ({ ...p, ...notes }));
          cartActions.applyPrices(changed);
        }
      })
      .catch((e) => e?.name !== "AbortError" && setFailed(true));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, attempt]);

  return { live, failed, priceNotes, retry: () => setAttempt((n) => n + 1) };
}

/** Delivery charge and whether ordering is possible right now (both come from the ERP through the server). */
export function useCheckoutInfo(): CheckoutInfo | null {
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/store/settings", { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => setInfo({ enabled: Boolean(d.enabled), deliveryCharge: typeof d.deliveryCharge === "number" ? d.deliveryCharge : null }))
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);
  return info;
}
