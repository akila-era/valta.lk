import type { PublicOrder } from "@/lib/erp/order-tracking";
import { OrderThumb } from "./order-thumb";
import { formatLkr, fromCents, multiplyMoney, toCents } from "@/lib/utils/money";

export function OrderSummary({ order }: { order: PublicOrder }) {
  const subtotal = fromCents(toCents(order.total) - toCents(order.deliveryCharge));
  return (
    <section className="rounded-3xl bg-surface p-5 sm:p-7" aria-label="Order summary">
      <h2 className="text-lg font-semibold tracking-tight">Order summary</h2>
      <ul className="mt-4 divide-y divide-border">
        {order.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-4 py-3">
            <OrderThumb src={l.image} className="h-16 w-16 rounded-xl !bg-white" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold leading-5">{l.name}{l.variantLabel ? ` (${l.variantLabel})` : ""}</span>
              <span className="mt-0.5 block text-muted">{formatLkr(l.unitPrice)} × {l.quantity}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular-nums">{formatLkr(subtotal)}</dd></div>
        <div className="flex justify-between text-muted"><dt>Delivery</dt><dd className="tabular-nums">{formatLkr(order.deliveryCharge)}</dd></div>
        <div className="flex items-baseline justify-between pt-1 text-base font-bold"><dt>Total</dt><dd className="text-xl tabular-nums">{formatLkr(order.total)}</dd></div>
      </dl>
    </section>
  );
}

export function CodNote({ collected }: { collected: boolean }) {
  return (
    <p className={`rounded-2xl p-4 text-sm leading-6 ${collected ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
      {collected
        ? "Cash on delivery: payment has been collected."
        : "Cash on delivery: payment is pending. You pay in cash when the order is delivered, and it will be marked as paid once the cash is collected."}
    </p>
  );
}
