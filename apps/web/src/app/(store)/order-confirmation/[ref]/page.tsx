import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Banknote, CalendarDays, CheckCircle2, Clock, MapPin, Package, PackageCheck, Phone, ShoppingBag, StickyNote, Truck, User, type LucideIcon } from "lucide-react";
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

/** A white card with a small heading, used for each block of the page. */
function Card({ title, icon: Icon, children, label, className = "" }: { title: string; icon: LucideIcon; children: React.ReactNode; label?: string; className?: string }) {
  return (
    <section aria-label={label ?? title} className={`rounded-panel border border-border bg-bg p-5 sm:p-6 ${className}`}>
      <h2 className="flex items-center gap-2.5 font-display text-lg font-extrabold text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One row of a details list: icon, label and value. */
function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 text-sm">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-0.5 break-words font-semibold text-ink">{children}</dd>
      </div>
    </div>
  );
}

/**
 * The page shown right after "Place order" (and from links to it): a thank-you panel with the reference to copy, the
 * delivery progress, what happens next, the delivery details (only for the person who placed it, staff, or the
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* Thank-you panel */}
          <section aria-labelledby="thanks" className="relative overflow-hidden rounded-panel bg-ink p-6 text-white sm:p-9">
            <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
            <span aria-hidden className="pointer-events-none absolute -bottom-28 right-10 h-56 w-56 rounded-full border border-white/10" />
            <div className="relative">
              <span className={`flex h-16 w-16 animate-[pop_0.5s_ease-out] items-center justify-center rounded-full shadow-neon ${pending ? "bg-warn" : cancelled ? "bg-danger" : "bg-brand-500"}`}>
                {pending ? <Clock className="h-8 w-8 text-white" aria-hidden /> : <CheckCircle2 className="h-8 w-8 text-white" aria-hidden />}
              </span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-brand-500">{pending ? "Order received" : cancelled ? "Order cancelled" : "Order placed"}</p>
              <h1 id="thanks" className="mt-1.5 font-display text-[clamp(1.75rem,1.3rem+1.6vw,2.6rem)] font-extrabold leading-tight tracking-title">
                {cancelled ? "This order was cancelled" : `Thank you${firstName ? `, ${firstName}` : ""}!`}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75 sm:text-[15px]">
                {pending
                  ? "We have your order and are confirming it with our system. There is no need to order again."
                  : cancelled
                    ? "If this is unexpected, please contact us with the reference below."
                    : "Your order is placed. We will prepare it and deliver it to you."}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-white/15 bg-white/5 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">Order reference</p>
                  <p className="mt-1 break-all font-mono text-lg font-black tracking-[0.04em] text-white min-[400px]:text-xl sm:text-2xl sm:tracking-[0.12em]" data-testid="order-ref">
                    {order.ref}
                  </p>
                  <p className="mt-1 text-xs text-white/60">Keep this code to track your order.</p>
                </div>
                <CopyRef value={order.ref} />
              </div>
              {placedOn ? (
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/60">
                  <CalendarDays className="h-4 w-4" aria-hidden /> Placed on {placedOn}
                </p>
              ) : null}
            </div>
          </section>

          {pending && (
            <p role="status" className="rounded-card border border-warn/30 bg-warn-bg p-4 text-sm text-warn" data-testid="pending-note">
              Your order is saved and is being confirmed with our system. This can take a few minutes; there is no need to order again.
              You can follow its progress on the tracking page.
            </p>
          )}

          {/* Delivery progress */}
          <Card title="Order status" icon={Package} label="Order status and payment">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Status:</span>
              <span className="rounded-full bg-brand-50 px-3 py-0.5 font-bold text-brand-700" data-testid="order-status">{STATUS_LABEL[order.status] ?? order.status}</span>
              <span className="ml-auto text-muted">Payment:</span>
              <span className={`rounded-full px-3 py-0.5 font-bold ${order.codCollected ? "bg-success-bg text-success" : "bg-surface text-ink"}`} data-testid="payment-status">
                {order.codCollected ? "Paid (cash collected)" : cod ? "Pending: pay in cash on delivery" : order.paymentMethod}
              </span>
            </div>
            <OrderProgress status={order.status} />
            {(order.trackingNumber || order.carrier) && (
              <p className="mt-5 flex flex-wrap items-center gap-2 rounded-control bg-surface px-4 py-3 text-sm">
                <Truck className="h-4 w-4 text-brand-600" aria-hidden />
                {order.carrier ? <span className="font-semibold">{order.carrier}</span> : null}
                {order.trackingNumber ? (
                  <span>
                    Tracking number <span className="font-mono font-bold">{order.trackingNumber}</span>
                  </span>
                ) : null}
              </p>
            )}
          </Card>

          {/* What happens next */}
          {!cancelled ? (
            <Card title="What happens next" icon={ArrowRight}>
              <ol className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: PackageCheck, title: "We confirm it", text: "We check stock and confirm your order." },
                  { icon: Truck, title: "We deliver it", text: "Your order is packed and sent to your address. Follow it with your reference." },
                  {
                    icon: Banknote,
                    title: cod ? "You pay on delivery" : "Payment",
                    text: cod ? `Pay ${formatLkr(order.total)} in cash when it arrives.` : `Payment: ${order.paymentMethod}.`,
                  },
                ].map((s, i) => (
                  <li key={s.title} className="rounded-card bg-surface p-4">
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                      <s.icon className="h-5 w-5 text-brand-600" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm font-bold text-ink">{s.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{s.text}</p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {/* Delivery details: only for the person who placed it */}
          {payload && (
            <Card title="Delivery details" icon={MapPin}>
              <dl className="divide-y divide-border sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0" data-testid="delivery-details">
                <Row icon={User} label="Name">{payload.customer.name}</Row>
                <Row icon={Phone} label="Phone">{payload.customer.phone}</Row>
                <Row icon={MapPin} label="Address">
                  {payload.delivery.addressLine1}, {payload.delivery.city}, {payload.delivery.district}
                  {payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}
                </Row>
                {payload.delivery.notes ? <Row icon={StickyNote} label="Notes">{payload.delivery.notes}</Row> : null}
              </dl>
            </Card>
          )}
        </div>

        {/* Order summary, beside the details on wide screens */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)]">
          <section aria-label="Order summary" className="rounded-panel border border-border bg-bg p-5 sm:p-6">
            <h2 className="flex items-baseline justify-between font-display text-lg font-extrabold text-ink">
              Order summary <span className="text-xs font-semibold text-muted">{items} {items === 1 ? "item" : "items"}</span>
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
                    <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-semibold tabular-nums">{formatLkr(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="font-semibold tabular-nums">{formatLkr(order.deliveryCharge)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <dt className="font-bold">{cod && !order.codCollected ? "Pay on delivery" : "Total"}</dt>
                <dd className="font-display text-2xl font-extrabold tabular-nums text-brand-600">{formatLkr(order.total)}</dd>
              </div>
            </dl>
            {cod ? (
              <p className={`mt-4 flex gap-2 rounded-control p-3 text-xs leading-5 ${order.codCollected ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>
                <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                {order.codCollected ? "Cash on delivery: payment has been collected." : "Cash on delivery: you pay when the order arrives. It is marked as paid once the cash is collected."}
              </p>
            ) : null}
          </section>

          <div className="grid gap-2.5">
            <Link href={`/track-order?ref=${order.ref}`} className="btn-primary min-h-12 rounded-full text-[15px] shadow-glow">
              Track your order <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/products" className="btn-secondary min-h-12 rounded-full">Continue shopping</Link>
            {customer ? (
              <Link href="/account/orders" className="py-1 text-center text-sm font-semibold text-brand-600 hover:underline">View all my orders</Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
