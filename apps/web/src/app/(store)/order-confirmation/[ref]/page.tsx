import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ShoppingBag } from "lucide-react";
import { OrderProgress } from "@/components/account/order-card";
import { CopyRef } from "@/components/orders/copy-ref";
import { ErpUnavailable } from "@/components/ui/states";
import { isAdminEmail } from "@/lib/admin/auth";
import { getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ErpError } from "@/lib/erp/errors";
import type { CreateOrderRequest } from "@/lib/erp/types";
import { accessTokensFor } from "@/lib/orders/access-cookie";
import { canSeeOrderDetails, loadOrderView } from "@/lib/orders/public";
import { addMoney, formatLkr, multiplyMoney } from "@/lib/utils/money";
import { isValidOrderRef } from "@/lib/utils/order-ref";

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

/** A plain block of the page: a heading and its content, separated from the next block by a rule. */
function Block({ title, children, label }: { title: string; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="border-t border-border pt-6">
      <h2 className="font-display text-lg font-extrabold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The page shown right after "Place order" (and from links to it): the thank-you line with the reference to copy,
 * the delivery progress, what happens next, the delivery details (only for the person who placed it, staff, or the
 * signed-in owner), and the order summary with photos beside it.
 */
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
  const cancelled = order.status === "CANCELLED";
  const firstName = payload?.customer.name.trim().split(/\s+/)[0];
  const placedOn = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-LK", { day: "numeric", month: "long", year: "numeric" }) : null;
  const items = order.lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = addMoney(...order.lines.map((l) => multiplyMoney(l.unitPrice, l.quantity)));
  const cod = order.paymentMethod === "COD";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="thanks">
            <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${pending ? "text-warn" : cancelled ? "text-danger" : "text-success"}`}>
              {!pending && !cancelled ? <Check className="h-4 w-4" aria-hidden /> : null}
              {pending ? "Order received" : cancelled ? "Order cancelled" : "Order placed"}
              {placedOn ? <span className="font-normal text-muted">· {placedOn}</span> : null}
            </p>
            <h1 id="thanks" className="mt-2 font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.4rem)] font-extrabold leading-tight tracking-title text-ink">
              {cancelled ? "This order was cancelled" : `Thank you${firstName ? `, ${firstName}` : ""}.`}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-muted">
              {pending
                ? "We have your order and are confirming it with our system. There is no need to order again."
                : cancelled
                  ? "If this is unexpected, please contact us with the reference below."
                  : "We will confirm it, then pack and deliver it to your address."}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-surface px-4 py-3.5 sm:px-5">
              <span className="text-sm text-muted">Order reference</span>
              <span className="break-all font-mono text-lg font-bold tracking-[0.04em] text-ink sm:text-xl" data-testid="order-ref">
                {order.ref}
              </span>
              <span className="ml-auto">
                <CopyRef value={order.ref} />
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">Keep this reference to track your order or when you contact us.</p>
          </section>

          {pending && (
            <p role="status" className="rounded-card border border-warn/30 bg-warn-bg p-4 text-sm text-warn" data-testid="pending-note">
              Your order is saved and is being confirmed with our system. This can take a few minutes; there is no need to order again.
              You can follow its progress on the tracking page.
            </p>
          )}

          <Block title="Order status" label="Order status and payment">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-md">
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-0.5 font-semibold text-ink" data-testid="order-status">{STATUS_LABEL[order.status] ?? order.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Payment</dt>
                <dd className={`mt-0.5 font-semibold ${order.codCollected ? "text-success" : "text-ink"}`} data-testid="payment-status">
                  {order.codCollected ? "Paid (cash collected)" : cod ? "Cash on delivery" : order.paymentMethod}
                </dd>
              </div>
            </dl>
            <OrderProgress status={order.status} />
            {(order.trackingNumber || order.carrier) && (
              <p className="mt-5 text-sm text-ink">
                {order.carrier ? <span className="font-semibold">{order.carrier}</span> : null}
                {order.carrier && order.trackingNumber ? " · " : null}
                {order.trackingNumber ? (
                  <span>
                    Tracking number <span className="font-mono font-bold">{order.trackingNumber}</span>
                  </span>
                ) : null}
              </p>
            )}
          </Block>

          {!cancelled ? (
            <Block title="What happens next">
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-ink marker:font-semibold marker:text-muted">
                <li>We check stock and confirm your order.</li>
                <li>We pack it and send it to your address. You can follow it with your order reference.</li>
                <li>{cod ? `You pay ${formatLkr(order.total)} in cash when it arrives.` : `Payment: ${order.paymentMethod}.`}</li>
              </ol>
            </Block>
          ) : null}

          {payload && (
            <Block title="Delivery details">
              <dl className="grid gap-4 text-sm sm:grid-cols-2" data-testid="delivery-details">
                <div>
                  <dt className="text-muted">Name</dt>
                  <dd className="mt-0.5 break-words font-semibold text-ink">{payload.customer.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">Phone</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{payload.customer.phone}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">Address</dt>
                  <dd className="mt-0.5 break-words font-semibold text-ink">
                    {payload.delivery.addressLine1}, {payload.delivery.city}, {payload.delivery.district}
                    {payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}
                  </dd>
                </div>
                {payload.delivery.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Notes</dt>
                    <dd className="mt-0.5 break-words text-ink">{payload.delivery.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </Block>
          )}
        </div>

        {/* Order summary, beside the details on wide screens */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)]">
          <section aria-label="Order summary" className="rounded-panel border border-border bg-bg p-5 sm:p-6">
            <h2 className="flex items-baseline justify-between font-display text-lg font-extrabold text-ink">
              Order summary <span className="text-sm font-normal text-muted">{items} {items === 1 ? "item" : "items"}</span>
            </h2>
            <ul className="mt-4 divide-y divide-border">
              {order.lines.map((l, i) => {
                const thumb = (
                  <span className="thumb-stage relative block h-16 w-16 shrink-0 overflow-hidden rounded-control border border-border">
                    {l.image ? <Image src={l.image} alt="" fill sizes="64px" className="object-contain p-1" /> : <ShoppingBag className="absolute inset-0 m-auto h-6 w-6 text-muted" aria-hidden />}
                  </span>
                );
                return (
                  <li key={i} className="flex items-center gap-3 py-3 first:pt-0">
                    {l.slug ? <Link href={`/products/${l.slug}`} tabIndex={-1} aria-hidden className="block shrink-0">{thumb}</Link> : thumb}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                        {l.slug ? <Link href={`/products/${l.slug}`} className="hover:text-brand-600">{l.name}</Link> : l.name}
                      </p>
                      <p className="text-xs text-muted">
                        {l.variantLabel ? `${l.variantLabel} · ` : ""}Qty {l.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatLkr(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{formatLkr(order.deliveryCharge)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <dt className="font-semibold">{cod && !order.codCollected ? "To pay on delivery" : "Total"}</dt>
                <dd className="text-xl font-bold tabular-nums text-ink">{formatLkr(order.total)}</dd>
              </div>
            </dl>
            {cod ? (
              <p className={`mt-3 text-xs leading-5 ${order.codCollected ? "text-success" : "text-muted"}`}>
                {order.codCollected ? "Cash on delivery: payment has been collected." : "Cash on delivery. Please keep the exact amount ready if you can."}
              </p>
            ) : null}
          </section>

          <div className="grid gap-2.5">
            <Link href={`/track-order?ref=${order.ref}`} className="btn-primary min-h-12">
              Track your order
            </Link>
            <Link href="/products" className="btn-secondary min-h-12">Continue shopping</Link>
            {customer ? (
              <Link href="/account/orders" className="py-1 text-center text-sm font-semibold text-ink underline-offset-4 hover:underline">View all my orders</Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
