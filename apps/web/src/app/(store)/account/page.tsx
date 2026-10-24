import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { ProfileForm } from "@/components/account/profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { orderRefsFor } from "@/lib/auth/accounts";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { PublicOrder } from "@/lib/erp/order-tracking";
import { loadOrderView } from "@/lib/orders/public";
import { formatLkr } from "@/lib/utils/money";
import { PageIntro } from "@/components/ui/page-intro";

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
  // Status always comes from the ERP; a reference the ERP cannot return is still listed with a tracking link.
  const orders = await Promise.all(
    refs.map(async (ref) => ({ ref, order: await loadOrderView(getDb(), ref).then((v) => v.order).catch(() => null as PublicOrder | null) })),
  );
  const phone = displayPhone(customer.phone);

  return (
    <div>
      <PageIntro section="Account" label="Overview" title="My account" />
      <div className="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Account" className="min-w-0">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0 lg:shrink">
                <Link
                  href={item.href}
                  aria-current={item.href === "/account" ? "page" : undefined}
                  className={`inline-flex min-h-11 w-full items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${item.href === "/account" ? "bg-brand-50 text-ink" : "text-muted hover:bg-surface hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-8">
          <section className="card p-5 sm:p-6" aria-labelledby="account-name">
            <p className="text-sm text-muted">Signed in as</p>
            <h2 id="account-name" className="mt-1 text-xl font-bold text-ink">{customer.name}</h2>
            <p className="mt-1 text-sm text-muted">{customer.email}</p>
            {phone && <p className="text-sm text-muted">{phone}</p>}
            <p className="mt-3 text-sm text-muted">{orders.length === 0 ? "Orders you place while signed in are listed below." : `${orders.length} ${orders.length === 1 ? "order" : "orders"} linked to this account.`}</p>
            <div className="mt-5 max-w-xs"><SignOutButton /></div>
          </section>

          <section aria-labelledby="orders-title">
            <h2 id="orders-title" className="text-xl font-bold text-ink">My orders</h2>
            <p className="mt-1 text-sm text-muted">Orders placed while you were signed in. Status comes from the order record.</p>
            {orders.length === 0 ? (
              <div className="card mt-4 flex flex-col items-center gap-3 p-10 text-center">
                <Package className="h-10 w-10 text-muted" aria-hidden />
                <p className="font-semibold">No orders yet</p>
                <p className="max-w-sm text-sm text-muted">Orders you place while signed in will appear here. Guest orders can still be checked with the order reference.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  <Link href="/products" className="btn-primary">Start shopping</Link>
                  <Link href="/track-order" className="btn-secondary">Track an order</Link>
                </div>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {orders.map(({ ref, order }) => (
                  <li key={ref} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold tracking-wide">{ref}</p>
                        {order ? (
                          <>
                            <p className="mt-1 text-sm text-muted">
                              {order.createdAt && <>{new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })} · </>}
                              {itemCount(order)} · {formatLkr(order.total)}
                            </p>
                            {productSummary(order) && <p className="mt-1 text-sm text-ink">{productSummary(order)}</p>}
                            <p className="mt-1 text-sm text-muted">{paymentLabel(order)}</p>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-muted">Status unavailable right now.</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {order && (
                          <span className={`badge ${order.status === "CANCELLED" ? "bg-surface text-muted" : order.status === "DELIVERED" ? "bg-success-bg text-success" : order.status === "RECEIVED" ? "bg-warn-bg text-warn" : "bg-brand-50 text-brand-700"}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                        )}
                        <Link href={`/track-order?ref=${ref}`} className="btn-secondary min-h-10 px-4 text-sm">Track</Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="profile" className="card p-5 sm:p-6" aria-labelledby="profile-title">
            <h2 id="profile-title" className="text-base font-semibold text-ink">Profile</h2>
            <p className="mt-1 text-sm text-muted">Your name and phone are used to fill in checkout. Email cannot be changed here.</p>
            <div className="mt-4 max-w-md"><ProfileForm name={customer.name} phone={customer.phone} /></div>
            <p className="mt-4 text-sm text-muted">
              Delivery addresses are entered at checkout. This account does not store an address book.
              {" "}
              <Link href="/account/forgot-password" className="font-semibold text-brand-600 hover:underline">Reset your password</Link>
              {" "}
              by email if you need to change it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
