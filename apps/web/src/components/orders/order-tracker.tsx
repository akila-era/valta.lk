"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CodNote, OrderSummary } from "./order-summary";
import { ORDER_REF_PATTERN } from "@/lib/utils/order-ref";
import type { PublicOrder } from "@/lib/erp/order-tracking";

const STEPS = [
  { status: "PLACED", label: "Order placed" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "DISPATCHED", label: "Dispatched" },
  { status: "DELIVERED", label: "Delivered" },
] as const;
const POLL_MS = 30_000;
const TERMINAL = ["DELIVERED", "CANCELLED"];

export function OrderTracker({ initialRef = "" }: { initialRef?: string }) {
  const [input, setInput] = useState(initialRef);
  const [ref, setRef] = useState<string | null>(() => (ORDER_REF_PATTERN.test(initialRef.toUpperCase()) ? initialRef.toUpperCase() : null));
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (r: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/store/orders/${encodeURIComponent(r)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setOrder(data.order);
        setError(null);
        return data.order as PublicOrder;
      }
      if (!silent) setOrder(null);
      setError(data?.error?.message ?? "We could not load this order.");
    } catch {
      setError("Network problem. We will keep trying.");
    } finally {
      if (!silent) setLoading(false);
    }
    return null;
  }, []);

  // Poll only while the tab is visible and the order is not in a terminal state.
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        const o = await load(ref, true);
        if (o && TERMINAL.includes(o.status)) return;
      }
      timer.current = setTimeout(tick, POLL_MS);
    };
    (async () => {
      const first = await load(ref);
      if (!cancelled && !(first && TERMINAL.includes(first.status))) timer.current = setTimeout(tick, POLL_MS);
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ref, load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (!ORDER_REF_PATTERN.test(v)) {
      setOrder(null);
      setRef(null);
      setError("Enter a valid order reference, e.g. VLK-251019-ABCDEFGHJK.");
      return;
    }
    setError(null);
    setOrder(null);
    setRef(v);
  }

  async function cancel() {
    if (!ref || !confirm("Cancel this order?")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/store/orders/${ref}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (res.ok) setOrder(data.order);
      else setError(data?.error?.message ?? "We could not cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

  const stepIndex = order ? STEPS.findIndex((s) => s.status === order.status) : -1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form onSubmit={submit} className="card p-5" noValidate>
        <label htmlFor="ref" className="label">Order reference</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="ref" value={input} onChange={(e) => setInput(e.target.value)} className="input" placeholder="VLK-…" autoComplete="off" aria-invalid={error && !order ? true : undefined} aria-describedby={error ? "ref-err" : undefined} />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Track order
          </button>
        </div>
        {error && <p id="ref-err" role="alert" className="field-error">{error}</p>}
      </form>

      {order && (
        <div className="space-y-6" aria-live="polite">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Order {order.ref}</h2>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700" data-testid="status">{order.status.charAt(0) + order.status.slice(1).toLowerCase()}</span>
            </div>

            {order.status === "CANCELLED" ? (
              <p className="mt-4 rounded-lg bg-danger-bg p-4 text-sm text-danger">This order has been cancelled. If you did not request this, please contact us.</p>
            ) : (
              <ol className="mt-6 space-y-4">
                {STEPS.map((s, i) => {
                  const done = i <= stepIndex;
                  return (
                    <li key={s.status} className="flex items-center gap-3" aria-current={i === stepIndex ? "step" : undefined}>
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${done ? "border-brand-500 bg-brand-500 text-on-brand" : "border-border text-muted"}`}>
                        {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                      </span>
                      <span className={done ? "font-semibold" : "text-muted"}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {order.status === "RECEIVED" && (
              <p role="status" className="mt-4 rounded-lg bg-warn-bg p-4 text-sm text-warn" data-testid="received-note">
                We have received your order and are confirming it with our system. There is no need to order again: this page updates by itself.
              </p>
            )}
            {order.status === "DELIVERED" && <p className="mt-4 rounded-lg bg-success-bg p-4 text-sm text-success">This order has been delivered.</p>}
            {(order.trackingNumber || order.carrier) && (
              <dl className="mt-6 grid gap-2 border-t border-border pt-4 text-sm">
                {order.carrier && <div className="flex justify-between gap-4"><dt className="text-muted">Carrier</dt><dd className="min-w-0 break-words text-right font-medium">{order.carrier}</dd></div>}
                {order.trackingNumber && <div className="flex justify-between gap-4"><dt className="shrink-0 text-muted">Tracking number</dt><dd className="min-w-0 break-all text-right font-medium">{order.trackingNumber}</dd></div>}
              </dl>
            )}
            {(order.status === "DISPATCHED" || order.status === "DELIVERED") && !order.trackingNumber && !order.carrier && (
              <p className="mt-4 text-sm text-muted">No courier or tracking number has been added for this order.</p>
            )}
            {order.cancellable && (
              <button type="button" className="btn-secondary mt-6" onClick={cancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel order"}
              </button>
            )}
          </div>
          <CodNote collected={order.codCollected} />
          <OrderSummary order={order} />
          <p className="text-xs text-muted">
            Returns are processed by our team and do not change the status shown here. Contact us about a return and we will arrange it with you. Refunds are not automatic.
          </p>
        </div>
      )}
    </div>
  );
}
