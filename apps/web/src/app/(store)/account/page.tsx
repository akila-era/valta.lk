import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, ShieldCheck, User } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { ProfileForm } from "@/components/account/profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { orderRefsFor } from "@/lib/auth/accounts";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { PublicOrder } from "@/lib/erp/order-tracking";
import { loadOrderView } from "@/lib/orders/public";
import { formatLkr } from "@/lib/utils/money";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account#orders-title", label: "My orders" },
  { href: "/account#profile", label: "Profile" },
  { href: "/track-order", label: "Track an order" },
] as const;

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
  if (order.paymentMethod === "COD") {
    return order.codCollected ? "Paid (cash collected)" : "Payment pending: cash on delivery";
  }
  return order.paymentMethod;
}

function displayPhone(phone: string | null) {
  return phone?.replace(/^\+94/, "0") ?? null;
}

export default async function AccountPage() {
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login?next=/account");

  const refs = await orderRefsFor(getDb()!, customer.id).catch(() => [] as string[]);
  const orders = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      order: await loadOrderView(getDb(), ref).then((v) => v.order).catch(() => null as PublicOrder | null),
    })),
  );
  const phone = displayPhone(customer.phone);

  return (
    <div className="space-y-8">
      <StoreHeroBanner
        title="My account"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Account" },
        ]}
        intro={
          orders.length > 0
            ? `${orders.length} ${orders.length === 1 ? "order" : "orders"} linked to this account. Manage profile and track deliveries.`
            : "Manage your account profile, view previous order receipts, and track your recent shipments."
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Navigation Sidebar */}
        <nav aria-label="Account" className="min-w-0">
          <div className="rounded-2xl border border-border/80 bg-white p-2.5 shadow-soft">
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {NAV.map((item) => (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={item.href === "/account" ? "page" : undefined}
                    className={`inline-flex min-h-10 w-full items-center whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                      item.href === "/account"
                        ? "bg-brand-50 text-brand-700 font-bold"
                        : "text-muted hover:bg-surface/70 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Content Area */}
        <div className="min-w-0 space-y-8">
          {/* User Info Card */}
          <section className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft sm:p-8" aria-labelledby="account-name">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
                  Signed In Customer
                </p>
                <h2 id="account-name" className="mt-1 text-2xl font-bold tracking-tight text-ink">
                  {customer.name}
                </h2>
                <div className="mt-2 space-y-0.5 text-sm text-muted">
                  <p>{customer.email}</p>
                  {phone && <p>{phone}</p>}
                </div>
                <p className="mt-3 text-xs text-muted">
                  {orders.length === 0
                    ? "Orders you place while signed in will automatically be listed here."
                    : `${orders.length} ${orders.length === 1 ? "order" : "orders"} linked to this account.`}
                </p>
              </div>

              <div className="w-full sm:w-auto">
                <SignOutButton className="btn-secondary rounded-full px-5 py-2 text-xs font-semibold shadow-soft hover:shadow-lift" />
              </div>
            </div>
          </section>

          {/* Orders Section */}
          <section aria-labelledby="orders-title" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="orders-title" className="font-display text-xl font-bold tracking-[-0.015em] text-ink">
                  My Orders
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Real-time status synced with our warehouse management system.
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/80 bg-white p-10 text-center shadow-soft">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-soft">
                  <Package className="h-6 w-6" aria-hidden />
                </div>
                <p className="font-display text-base font-bold text-ink">No orders yet</p>
                <p className="max-w-sm text-xs leading-5 text-muted">
                  Orders you place while signed in will appear here. Guest orders can still be checked with the order reference.
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-2.5">
                  <Link href="/products" className="btn-primary rounded-full px-5 py-2 text-xs font-semibold shadow-soft hover:shadow-lift">
                    Start shopping
                  </Link>
                  <Link href="/track-order" className="btn-secondary rounded-full px-5 py-2 text-xs font-semibold shadow-soft hover:shadow-lift">
                    Track an order
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {orders.map(({ ref, order }) => (
                  <li key={ref} className="rounded-2xl border border-border/80 bg-white p-5 shadow-soft transition-all hover:shadow-lift">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold tracking-wider text-ink">
                            {ref}
                          </span>
                          {order && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                order.status === "CANCELLED"
                                  ? "bg-surface text-muted"
                                  : order.status === "DELIVERED"
                                    ? "bg-success-bg text-success"
                                    : order.status === "RECEIVED"
                                      ? "bg-warn-bg text-warn"
                                      : "bg-brand-50 text-brand-700"
                              }`}
                            >
                              {STATUS_LABEL[order.status] ?? order.status}
                            </span>
                          )}
                        </div>

                        {order ? (
                          <>
                            <p className="mt-1.5 text-xs text-muted">
                              {order.createdAt && (
                                <>
                                  {new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })} ·{" "}
                                </>
                              )}
                              {itemCount(order)} ·{" "}
                              <span className="font-bold text-ink">{formatLkr(order.total)}</span>
                            </p>
                            {productSummary(order) && (
                              <p className="mt-1 text-xs font-medium text-ink">{productSummary(order)}</p>
                            )}
                            <p className="mt-1 text-[11px] text-muted">{paymentLabel(order)}</p>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-muted">Status unavailable right now.</p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center">
                        <Link
                          href={`/track-order?ref=${ref}`}
                          className="btn-secondary rounded-full px-4 py-1.5 text-xs font-semibold shadow-soft hover:shadow-lift"
                        >
                          Track Order
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Profile Section */}
          <section id="profile" className="rounded-3xl border border-border/80 bg-white p-6 shadow-soft sm:p-8" aria-labelledby="profile-title">
            <h2 id="profile-title" className="font-display text-lg font-bold text-ink">
              Profile Details
            </h2>
            <p className="mt-1 text-xs text-muted">
              Your name and phone are used to prefill checkout. Email cannot be changed.
            </p>
            <div className="mt-5 max-w-md">
              <ProfileForm name={customer.name} phone={customer.phone} />
            </div>
            <p className="mt-5 text-xs leading-5 text-muted">
              Delivery addresses are entered at checkout. This account does not store an address book.{" "}
              <Link href="/account/forgot-password" className="font-semibold text-brand-600 underline hover:text-brand-700">
                Reset your password
              </Link>{" "}
              by email if you need to change it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
