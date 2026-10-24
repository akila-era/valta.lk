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
  // Delivery details are personal data: shown only to the customer it belongs to, the browser that placed the order, or staff.
  const canSee = canSeeOrderDetails(local, {
    customerId: customer?.id,
    tokens: await accessTokensFor(ref),
    isAdmin: customer ? isAdminEmail(customer.email) : false,
  });
  const payload = canSee && local ? (local.payload as unknown as CreateOrderRequest) : null;
  const pending = order.status === "RECEIVED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="relative overflow-hidden rounded-panel bg-[linear-gradient(150deg,#fff4ec,#ffffff_55%,#f6f4f0)] px-6 py-10 text-center shadow-soft ring-1 ring-brand-500/10">
        {pending ? <Clock className="mx-auto h-12 w-12 text-warn" aria-hidden /> : <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />}
        <p className="kicker mt-4"><span className="text-brand-600">Orders</span> / Confirmation</p>
        <h1 className="statement mx-auto mt-3 max-w-[16ch] text-[clamp(2rem,1.5rem+2vw,3.25rem)]">{accentize(pending ? "Thank you, we have your order" : "Thank you, your order is placed", "Thank you")}</h1>
        <p className="mt-2 text-sm text-muted">Your order reference</p>
        <p className="mt-1 text-xl font-bold tracking-wider" data-testid="order-ref">{order.ref}</p>
        <p className="mt-2 text-sm text-muted">Keep this reference to track your order.</p>
      </div>

      {pending && (
        <p role="status" className="rounded-lg bg-warn-bg p-4 text-sm text-warn" data-testid="pending-note">
          Your order is saved and is being confirmed with our system. This can take a few minutes; there is no need to order again.
          You can follow its progress on the tracking page.
        </p>
      )}

      <section className="card p-5" aria-label="Order status and payment">
        <h2 className="text-lg font-semibold">Status and payment</h2>
        <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2">
          <dt className="text-muted">Order status</dt>
          <dd className="font-semibold" data-testid="order-status">{STATUS_LABEL[order.status] ?? order.status}</dd>
          <dt className="text-muted">Payment method</dt>
          <dd>{order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod}</dd>
          <dt className="text-muted">Payment status</dt>
          <dd data-testid="payment-status">{order.codCollected ? "Paid (cash collected)" : "Pending: pay in cash on delivery"}</dd>
        </dl>
      </section>

      <CodNote collected={order.codCollected} />
      {(order.trackingNumber || order.carrier) && (
        <section className="card p-5" aria-label="Tracking">
          <h2 className="text-lg font-semibold">Tracking</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2">
            {order.carrier && (<><dt className="text-muted">Carrier</dt><dd>{order.carrier}</dd></>)}
            {order.trackingNumber && (<><dt className="text-muted">Tracking number</dt><dd className="font-semibold">{order.trackingNumber}</dd></>)}
          </dl>
        </section>
      )}
      <OrderSummary order={order} />

      {payload && (
        <section className="card p-5" aria-label="Delivery details">
          <h2 className="text-lg font-semibold">Delivery details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2" data-testid="delivery-details">
            <dt className="text-muted">Name</dt><dd>{payload.customer.name}</dd>
            <dt className="text-muted">Phone</dt><dd>{payload.customer.phone}</dd>
            <dt className="text-muted">Address</dt>
            <dd>{payload.delivery.addressLine1}, {payload.delivery.city}, {payload.delivery.district}{payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}</dd>
            {payload.delivery.notes && (<><dt className="text-muted">Notes</dt><dd>{payload.delivery.notes}</dd></>)}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link href={`/track-order?ref=${order.ref}`} className="btn-primary">Track your order</Link>
        <Link href="/products" className="btn-secondary">Continue shopping</Link>
      </div>
    </div>
  );
}
