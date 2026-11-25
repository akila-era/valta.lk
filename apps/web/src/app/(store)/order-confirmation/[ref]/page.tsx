import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { CodNote, OrderSummary } from "@/components/orders/order-summary";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { ErpUnavailable } from "@/components/ui/states";
import { isAdminEmail } from "@/lib/admin/auth";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ErpError } from "@/lib/erp/errors";
import type { CreateOrderRequest } from "@/lib/erp/types";
import { accessTokensFor } from "@/lib/orders/access-cookie";
import { canSeeOrderDetails, loadOrderView } from "@/lib/orders/public";
import { isValidOrderRef } from "@/lib/utils/order-ref";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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
  const payzy = local?.paymentMethod === "PAYZY" || order.paymentMethod === "PAYZY";
  const koko = payzy || order.paymentMethod === "KOKO" || order.paymentMethod === "ONLINE";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-3xl bg-surface px-6 py-10 text-center sm:px-10">
        <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white ${pending ? "text-warn" : "text-success"}`}>
          {pending ? <Clock className="h-7 w-7" aria-hidden /> : <CheckCircle2 className="h-7 w-7" aria-hidden />}
        </span>
        <h1 className="page-title mt-5">{pending ? "Thank you, we have your order" : "Thank you, your order is placed"}</h1>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Your order reference</p>
        <p className="mt-1.5 break-all font-mono text-xl font-semibold tracking-wider sm:text-2xl" data-testid="order-ref">{order.ref}</p>
        <p className="mt-2 text-sm text-muted">Keep this reference to track your order.</p>
      </div>

      {pending && (
        <p role="status" className="rounded-2xl bg-warn-bg p-4 text-sm leading-6 text-warn" data-testid="pending-note">
          Your order is saved and is being confirmed with our system. This can take a few minutes; there is no need to order again.
          You can follow its progress on the tracking page.
        </p>
      )}

      <section className="rounded-3xl border border-border p-5 sm:p-7" aria-label="Order status and payment">
        <h2 className="text-lg font-semibold tracking-tight">Status and payment</h2>
        <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2">
          <dt className="text-muted">Order status</dt>
          <dd><OrderStatusBadge status={order.status} testId="order-status" /></dd>
          <dt className="text-muted">Payment method</dt>
          <dd>{order.paymentMethod === "COD" ? "Cash on delivery" : payzy ? "Payzy: pay in instalments" : order.paymentMethod === "KOKO" || order.paymentMethod === "ONLINE" ? "Koko: Buy Now Pay Later" : order.paymentMethod}</dd>
          <dt className="text-muted">Payment status</dt>
          <dd data-testid="payment-status">{koko ? (local?.paymentStatus === "PAID" ? (payzy ? "Paid with Payzy" : "Paid with Koko") : "Awaiting payment") : order.codCollected ? "Paid (cash collected)" : "Pending: pay in cash on delivery"}</dd>
        </dl>
      </section>

      {!koko && <CodNote collected={order.codCollected} />}
      {(order.trackingNumber || order.carrier) && (
        <section className="rounded-3xl border border-border p-5 sm:p-7" aria-label="Tracking">
          <h2 className="text-lg font-semibold tracking-tight">Tracking</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2">
            {order.carrier && (<><dt className="text-muted">Carrier</dt><dd>{order.carrier}</dd></>)}
            {order.trackingNumber && (<><dt className="text-muted">Tracking number</dt><dd className="font-mono font-semibold">{order.trackingNumber}</dd></>)}
          </dl>
        </section>
      )}
      <OrderSummary order={order} />

      {payload && (
        <section className="rounded-3xl border border-border p-5 sm:p-7" aria-label="Delivery details">
          <h2 className="text-lg font-semibold tracking-tight">Delivery details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-2" data-testid="delivery-details">
            <dt className="text-muted">Name</dt><dd>{payload.customer.name}</dd>
            <dt className="text-muted">Phone</dt><dd>{payload.customer.phone}</dd>
            <dt className="text-muted">Address</dt>
            <dd>{payload.delivery.addressLine1}, {payload.delivery.city}, {payload.delivery.district}{payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}</dd>
            {payload.delivery.notes && (<><dt className="text-muted">Notes</dt><dd>{payload.delivery.notes}</dd></>)}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3 pb-4">
        <Link href={`/track-order?ref=${order.ref}`} className="btn-primary">Track your order</Link>
        <Link href="/products" className="btn-secondary">Continue shopping</Link>
      </div>
    </div>
  );
}
