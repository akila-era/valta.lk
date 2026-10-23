import type { PublicOrder } from "@/lib/erp/order-tracking";
import { formatLkr, multiplyMoney } from "@/lib/utils/money";

export function OrderSummary({ order }: { order: PublicOrder }) {
  return (
    <section className="card p-5" aria-label="Order summary">
      <h2 className="text-lg font-semibold">Order summary</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {order.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0">{l.name}{l.variantLabel ? ` (${l.variantLabel})` : ""} × {l.quantity}</span>
            <span className="shrink-0 tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between"><dt>Delivery</dt><dd>{formatLkr(order.deliveryCharge)}</dd></div>
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatLkr(order.total)}</dd></div>
      </dl>
    </section>
  );
}

export function CodNote({ collected }: { collected: boolean }) {
  return (
    <p className={`rounded-lg p-4 text-sm ${collected ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
      {collected
        ? "Cash on delivery: payment has been collected."
        : "Cash on delivery: payment is pending. You pay in cash when the order is delivered, and it will be marked as paid once the cash is collected."}
    </p>
  );
}
