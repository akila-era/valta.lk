"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { cartActions } from "@/store/cart";
import type { CartLine } from "@/lib/utils/cart-math";

/**
 * Adds one unit to the cart. Disabled briefly after a click so a double-click cannot add twice.
 * `outline` is an orange outline that fills on hover; `bar` is the product card's full-width orange bar. The accessible
 * name stays "Add to cart: <name>".
 */
export function AddToCartButton({ line, label = "Add to cart", compact, outline, bar }: { line: Omit<CartLine, "quantity">; label?: string; compact?: boolean; outline?: boolean; bar?: boolean }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function add() {
    if (done) return;
    cartActions.add({ ...line, quantity: 1 });
    setDone(true);
    timer.current = setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={done}
      aria-label={done ? `${line.name} added to cart` : `${label}: ${line.name}`}
      className={
        bar
          ? "flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-brand-500 px-3 text-xs font-bold uppercase tracking-[0.08em] text-on-brand transition-colors hover:bg-ink hover:text-white disabled:cursor-default disabled:bg-ink disabled:text-white"
          : outline
          ? "btn min-h-10 w-full border border-brand-500 px-3 text-[13px] text-brand-700 hover:bg-brand-500 hover:text-on-brand hover:shadow-neon disabled:cursor-default disabled:border-success disabled:bg-success disabled:text-white disabled:opacity-100"
          : `btn-primary w-full ${compact ? "min-h-10 px-3" : ""}`
      }
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
      <span>{done ? "Added" : label}</span>
    </button>
  );
}
