import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { CodNote, OrderSummary } from "@/components/orders/order-summary";
import { ErpUnavailable } from "@/components/ui/states";
import { isAdminEmail } from "@/lib/admin/auth";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ErpError } from "@/lib/erp/errors";
import type { CreateOrderRequest } from "@/lib/erp/types";
import { accessTokensFor } from "@/lib/orders/access-cookie";
import { canSeeOrderDetails, loadOrderView } from "@/lib/orders/public";
import { isValidOrderRef } from "@/lib/utils/order-ref";
import { accentize } from "@/components/ui/page-intro";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export default async function ConfirmationPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = (await params).ref.toUpperCase();
  if (!isValidOrderRef(ref)) notFound();

  let view;
  try {
    view = await loadOrderView(getDb(), ref);
  } catch (e) {
    if (e instanceof ErpError && e.kind === "NOT_FOUND") notFound();
    return <ErpUnavailable retryHref={`/order-confirmation/${ref}`} />;
  }
  const { order, local } = view;
  const customer = await getCurrentCustomer();
  const canSee = canSeeOrderDetails(local, {
    customerId: customer?.id,
    tokens: await accessTokensFor(ref),
    isAdmin: customer ? isAdminEmail(customer.email) : false,
  });
  const payload = canSee && local ? (local.payload as unknown as CreateOrderRequest) : null;
  const pending = order.status === "RECEIVED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-r from-[#FFF6EF] via-[#FAF8F5] to-[#FFF3E8] px-6 py-10 text-center shadow-soft">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:16px_16px]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/12 blur-3xl"
        />
        <div className="relative z-10">
          {pending ? (
            <Clock className="mx-auto h-12 w-12 text-warn" aria-hidden />
          ) : (
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          )}
          <p className="kicker mt-4"><span className="text-brand-600">Orders</span> / Confirmation</p>
          <h1 className="statement mx-auto mt-2 max-w-[16ch] text-[clamp(2rem,1.5rem+2vw,3rem)]">
            {accentize(pending ? "Thank you, we have your order" : "Thank you, your order is placed", "Thank you")}
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wider font-bold text-muted">Your order reference</p>
          <p className="mt-1 font-mono text-2xl font-black tracking-widest text-brand-600" data-testid="order-ref">
            {order.ref}
          </p>
          <p className="mt-2 text-xs text-muted">Keep this reference code to track your order anytime.</p>
        </div>
      </div>

      {pending && (
        <p role="status" className="rounded-2xl border border-warn/30 bg-warn-bg p-4 text-sm text-warn" data-testid="pending-note">
          Your order is saved and is being confirmed with our system. This can take a few minutes; there is no need to order again.
          You can follow its progress on the tracking page.
        </p>
      )}

      <section className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft" aria-label="Order status and payment">
        <h2 className="text-base font-bold text-ink">Status and payment</h2>
        <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2.5">
          <dt className="text-muted">Order status</dt>
          <dd className="font-bold text-ink" data-testid="order-status">{STATUS_LABEL[order.status] ?? order.status}</dd>
          <dt className="text-muted">Payment method</dt>
          <dd className="font-medium text-ink">{order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod}</dd>
          <dt className="text-muted">Payment status</dt>
          <dd className="font-medium" data-testid="payment-status">{order.codCollected ? "Paid (cash collected)" : "Pending: pay in cash on delivery"}</dd>
        </dl>
      </section>

      <CodNote collected={order.codCollected} />
      {(order.trackingNumber || order.carrier) && (
        <section className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft" aria-label="Tracking">
          <h2 className="text-base font-bold text-ink">Tracking</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2.5">
            {order.carrier && (<><dt className="text-muted">Carrier</dt><dd className="font-medium text-ink">{order.carrier}</dd></>)}
            {order.trackingNumber && (<><dt className="text-muted">Tracking number</dt><dd className="font-mono font-bold text-ink">{order.trackingNumber}</dd></>)}
          </dl>
        </section>
      )}
      <OrderSummary order={order} />

      {payload && (
        <section className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft" aria-label="Delivery details">
          <h2 className="text-base font-bold text-ink">Delivery details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2.5" data-testid="delivery-details">
            <dt className="text-muted">Name</dt><dd className="font-medium text-ink">{payload.customer.name}</dd>
            <dt className="text-muted">Phone</dt><dd className="font-medium text-ink">{payload.customer.phone}</dd>
            <dt className="text-muted">Address</dt>
            <dd className="font-medium text-ink">{payload.delivery.addressLine1}, {payload.delivery.city}, {payload.delivery.district}{payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}</dd>
            {payload.delivery.notes && (<><dt className="text-muted">Notes</dt><dd className="font-medium text-ink">{payload.delivery.notes}</dd></>)}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link href={`/track-order?ref=${order.ref}`} className="btn-primary rounded-full px-6 shadow-glow">Track your order</Link>
        <Link href="/products" className="btn-secondary rounded-full px-6">Continue shopping</Link>
      </div>
    </div>
  );
}
