"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { CodNote, OrderSummary } from "./order-summary";
import { OrderStatusBadge } from "./status-badge";
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
  const toast = useToast();

  async function copyTracking(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Tracking number copied.", "success");
    } catch {
      toast("Could not copy. Select the number and copy it instead.", "warning");
    }
  }

  const placed = order?.createdAt ? new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" }) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={submit} className="rounded-3xl bg-surface p-5 sm:p-7" noValidate>
        <label htmlFor="ref" className="label">Order reference</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="ref" value={input} onChange={(e) => setInput(e.target.value)} className="input font-mono tracking-wide" placeholder="VLK-…" autoComplete="off" aria-invalid={error && !order ? true : undefined} aria-describedby={error ? "ref-err" : undefined} />
          <button className="btn-dark shrink-0 whitespace-nowrap sm:px-8" type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Track order
          </button>
        </div>
        {error && <p id="ref-err" role="alert" className="field-error">{error}</p>}
      </form>

      {order && (
        <div className="space-y-6" aria-live="polite">
          <section className="rounded-3xl border border-border p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Order</p>
                <h2 className="mt-1 break-all font-mono text-lg font-semibold tracking-wide sm:text-xl">{order.ref}</h2>
                {placed && <p className="mt-1 text-sm text-muted">Placed {placed}</p>}
              </div>
              <OrderStatusBadge status={order.status} testId="status" className="text-sm" />
            </div>

            {order.status === "CANCELLED" ? (
              <p className="mt-6 rounded-2xl bg-danger-bg p-4 text-sm text-danger">This order has been cancelled. If you did not request this, please contact us.</p>
            ) : (
              <ol className="relative mt-8 grid gap-0 md:grid-cols-4" aria-label="Order progress">
                {/* Horizontal rail on wider screens; each step draws its own vertical connector on phones. */}
                <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-4 hidden h-0.5 bg-border md:block" />
                <span aria-hidden className="absolute left-[12.5%] top-4 hidden h-0.5 bg-ink transition-[width] duration-700 md:block motion-reduce:transition-none" style={{ width: `${(Math.max(stepIndex, 0) / (STEPS.length - 1)) * 75}%` }} />
                {STEPS.map((s, i) => {
                  const done = i < stepIndex || (i === stepIndex && order.status === "DELIVERED");
                  const current = i === stepIndex && !done;
                  const reached = i <= stepIndex;
                  return (
                    <li key={s.status} className="relative flex gap-4 pb-6 last:pb-0 md:flex-col md:items-center md:gap-3 md:pb-0 md:text-center" aria-current={i === stepIndex ? "step" : undefined}>
                      {i < STEPS.length - 1 && <span aria-hidden className={`absolute left-4 top-8 h-[calc(100%-1rem)] w-0.5 md:hidden ${i < stepIndex ? "bg-ink" : "bg-border"}`} />}
                      <span
                        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                          done ? "border-ink bg-ink text-white" : current ? "border-brand-500 bg-brand-500 text-on-brand ring-4 ring-brand-100" : "border-border bg-bg text-muted"
                        }`}
                      >
                        {done || (reached && !current) ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                      </span>
                      <span className="min-w-0 pt-1 md:pt-0">
                        <span className={`block text-sm ${reached ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {order.status !== "CANCELLED" && order.status !== "RECEIVED" && (
              <p className="mt-6 text-xs leading-5 text-muted">This shows the order&apos;s current status. The time of each step is not recorded on this page.</p>
            )}

            {order.status === "RECEIVED" && (
              <p role="status" className="mt-6 rounded-2xl bg-warn-bg p-4 text-sm text-warn" data-testid="received-note">
                We have received your order and are confirming it with our system. There is no need to order again: this page updates by itself.
              </p>
            )}
            {order.status === "DELIVERED" && <p className="mt-6 rounded-2xl bg-success-bg p-4 text-sm text-success">This order has been delivered.</p>}

            {(order.trackingNumber || order.carrier) && (
              <div className="mt-6 rounded-2xl bg-surface p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Delivery</p>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                  {order.carrier && (
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">Carrier</dt>
                      <dd className="mt-0.5 break-words text-base font-semibold">{order.carrier}</dd>
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">Tracking number</dt>
                      <dd className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 break-all font-mono text-base font-semibold">{order.trackingNumber}</span>
                        <button type="button" onClick={() => copyTracking(order.trackingNumber!)} className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink" aria-label="Copy tracking number">
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {(order.status === "DISPATCHED" || order.status === "DELIVERED") && !order.trackingNumber && !order.carrier && (
              <p className="mt-6 text-sm text-muted">No courier or tracking number has been added for this order.</p>
            )}
            {order.cancellable && (
              <button type="button" className="btn-secondary mt-6" onClick={cancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel order"}
              </button>
            )}
          </section>
          <CodNote collected={order.codCollected} />
          <OrderSummary order={order} />
          <p className="text-xs leading-5 text-muted">
            Returns are processed by our team and do not change the status shown here. Contact us about a return and we will arrange it with you. Refunds are not automatic.
          </p>
        </div>
      )}
    </div>
  );
}
