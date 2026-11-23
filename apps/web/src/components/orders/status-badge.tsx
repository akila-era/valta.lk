import type { PublicOrder } from "@/lib/erp/order-tracking";

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const TONE: Record<string, string> = {
  RECEIVED: "bg-warn-bg text-warn",
  PLACED: "bg-info-bg text-info",
  CONFIRMED: "bg-info-bg text-info",
  DISPATCHED: "bg-ink text-white",
  DELIVERED: "bg-success-bg text-success",
  CANCELLED: "bg-surface text-muted",
};

/** One badge for every place an order status is shown, so the colours mean the same thing everywhere. */
export function OrderStatusBadge({ status, className = "", testId }: { status: PublicOrder["status"]; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE[status] ?? "bg-surface text-muted"} ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
