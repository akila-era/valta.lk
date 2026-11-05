"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";
import { parseOrders, rawOrders, subscribeOrders } from "@/store/customer-memory";

/** "Your recent orders" on Track order: orders placed in this browser, one tap to track, no reference to type. */
export function RecentOrders() {
  const raw = useSyncExternalStore(subscribeOrders, rawOrders, () => "");
  const orders = useMemo(() => parseOrders(raw), [raw]);
  if (!orders.length) return null;
  return (
    <section aria-labelledby="recent-orders" className="mt-8 max-w-2xl">
      <h2 id="recent-orders" className="text-lg font-semibold text-ink">Your recent orders</h2>
      <p className="mt-1 text-sm text-muted">Orders placed in this browser. Tap one to see where it is.</p>
      <ul className="mt-3 divide-y divide-border rounded-card border border-border">
        {orders.map((o) => (
          <li key={o.ref}>
            <Link href={`/track-order?ref=${encodeURIComponent(o.ref)}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
              <span className="min-w-0">
                <span className="block font-mono text-sm font-bold text-ink">{o.ref}</span>
                <span className="block text-xs text-muted">
                  {new Date(o.at).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" })} · {formatLkr(o.total)}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
                Track <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
