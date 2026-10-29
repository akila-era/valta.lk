import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Package, ShoppingBag, Truck, XCircle } from "lucide-react";
import type { PublicOrder } from "@/lib/erp/order-tracking";
import { formatLkr } from "@/lib/utils/money";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  CANCELLED: "bg-danger/10 text-danger",
  DELIVERED: "bg-success-bg text-success",
  RECEIVED: "bg-warn-bg text-warn",
  DISPATCHED: "bg-ink text-white",
};

/** The delivery journey shown on each order card. RECEIVED (not yet in the ERP) counts as the first step. */
const STEPS = [
  { key: "PLACED", label: "Placed", icon: ShoppingBag },
  { key: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { key: "DISPATCHED", label: "Dispatched", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: Package },
] as const;
const stepIndex = (status: string) => Math.max(0, STEPS.findIndex((s) => s.key === (status === "RECEIVED" ? "PLACED" : status)));

function itemCount(order: PublicOrder) {
  const n = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  return `${n} ${n === 1 ? "item" : "items"}`;
}

function productSummary(order: PublicOrder) {
  const first = order.lines[0];
  if (!first) return null;
  const label = first.variantLabel ? `${first.name} (${first.variantLabel})` : first.name;
  const more = order.lines.length - 1;
  return more > 0 ? `${label} and ${more} more` : label;
}

function paymentLabel(order: PublicOrder) {
  if (order.paymentMethod === "COD") return order.codCollected ? "Paid · cash collected" : "Cash on delivery · pay when it arrives";
  return order.paymentMethod;
}

/** Placed → Confirmed → Dispatched → Delivered, filled up to the order's current step. */
function OrderProgress({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <p className="mt-4 inline-flex items-center gap-2 rounded-control bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
        <XCircle className="h-4 w-4" aria-hidden /> This order was cancelled.
      </p>
    );
  }
  const at = stepIndex(status);
  return (
    <ol className="mt-5 grid grid-cols-4" aria-label={`Progress: ${STEPS[at].label}`}>
      {STEPS.map((s, i) => {
        const done = i <= at;
        return (
          <li key={s.key} aria-hidden className="relative flex flex-col items-center text-center">
            {i > 0 ? <span className={`absolute right-1/2 top-4 h-[3px] w-full -translate-y-1/2 ${i <= at ? "bg-brand-500" : "bg-border"}`} /> : null}
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${done ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-bg text-muted"} ${i === at ? "ring-4 ring-brand-500/20" : ""}`}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className={`mt-1.5 text-[11px] font-semibold sm:text-xs ${done ? "text-ink" : "text-muted"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One order on the account pages: reference, status, what was bought, total, Track order and the progress steps. */
export function OrderCard({ orderRef, order }: { orderRef: string; order: PublicOrder | null }) {
  return (
    <li className="rounded-panel border border-border bg-bg p-5 transition-[border-color,box-shadow] hover:border-brand-500 hover:shadow-neon-lift sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm font-bold tracking-wide text-ink">{orderRef}</span>
            {order ? (
              <span data-testid="order-status" className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[order.status] ?? "bg-brand-50 text-brand-700"}`}>
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
            ) : null}
          </div>
          {order ? (
            <>
              {productSummary(order) ? <p className="mt-2 text-[15px] font-semibold text-ink">{productSummary(order)}</p> : null}
              <p className="mt-1 text-xs text-muted">
                {order.createdAt ? `${new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })} · ` : ""}
                {itemCount(order)} · {paymentLabel(order)}
              </p>
              {order.trackingNumber ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                  <MapPin className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                  {order.carrier ? `${order.carrier} · ` : ""}Tracking {order.trackingNumber}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">Status unavailable right now. Please try again shortly.</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {order ? <p className="font-display text-xl font-extrabold tabular-nums text-brand-600">{formatLkr(order.total)}</p> : null}
          <Link href={`/track-order?ref=${orderRef}`} className="btn-secondary min-h-10 px-4 text-[13px]">
            Track order <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
      {order ? <OrderProgress status={order.status} /> : null}
    </li>
  );
}

/** "No orders yet" with the ways forward. */
export function NoOrders() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-bg px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-neon">
        <Package className="h-7 w-7" aria-hidden />
      </span>
      <p className="mt-1 font-display text-lg font-extrabold text-ink">No orders yet</p>
      <p className="max-w-sm text-sm leading-6 text-muted">Orders you place while signed in appear here. Guest orders can still be checked with the order reference.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <Link href="/products" className="btn-primary min-h-11 px-5">Start shopping</Link>
        <Link href="/track-order" className="btn-secondary min-h-11 px-5">Track an order</Link>
      </div>
    </div>
  );
}
