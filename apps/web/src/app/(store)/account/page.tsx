import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Package } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { ProfileForm } from "@/components/account/profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { orderRefsFor } from "@/lib/auth/accounts";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { PublicOrder } from "@/lib/erp/order-tracking";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { OrderThumb } from "@/components/orders/order-thumb";
import { loadOrderView } from "@/lib/orders/public";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account#orders-title", label: "My orders" },
  { href: "/account#profile", label: "Profile" },
  { href: "/account#addresses", label: "Addresses" },
  { href: "/track-order", label: "Track an order" },
] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "V";
}

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

  const loaded = orders.filter((o): o is { ref: string; order: PublicOrder } => o.order !== null);
  const inProgress = loaded.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.order.status)).length;
  const delivered = loaded.filter((o) => o.order.status === "DELIVERED").length;
  const latest = loaded[0];

  return (
    <div>
      <h1 className="page-title">My account</h1>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Account" className="min-w-0 lg:sticky lg:top-40">
          <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const on = item.href === "/account";
              return (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-11 w-full items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors lg:rounded-xl ${on ? "bg-ink text-white" : "bg-surface text-ink hover:bg-border lg:bg-transparent lg:text-muted lg:hover:bg-surface lg:hover:text-ink"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-10">
          <section className="rounded-3xl bg-surface p-5 sm:p-7" aria-labelledby="account-name">
            <div className="flex flex-wrap items-center gap-4 sm:gap-5">
              <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-semibold tracking-tight text-white">{initials(customer.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Signed in as</p>
                <h2 id="account-name" className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-ink">{customer.name}</h2>
                <p className="mt-0.5 break-all text-sm text-muted">{customer.email}{phone ? ` · ${phone}` : ""}</p>
              </div>
              <div className="w-full sm:w-auto"><SignOutButton className="btn-secondary w-full bg-white" /></div>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-6">
              <div><dt className="text-xs text-muted">Orders</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{orders.length}</dd></div>
              <div><dt className="text-xs text-muted">In progress</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{inProgress}</dd></div>
              <div><dt className="text-xs text-muted">Delivered</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{delivered}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="orders-title">
            <h2 id="orders-title" className="section-title !text-2xl lg:!text-3xl">My orders</h2>
            <p className="mt-2 text-sm text-muted">Orders placed while you were signed in. Status comes from the order record.</p>
            {orders.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-surface p-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-muted"><Package className="h-6 w-6" aria-hidden /></span>
                <p className="font-semibold">No orders yet</p>
                <p className="max-w-sm text-sm text-muted">Orders you place while signed in will appear here. Guest orders can still be checked with the order reference.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  <Link href="/products" className="btn-primary">Start shopping</Link>
                  <Link href="/track-order" className="btn-secondary bg-transparent">Track an order</Link>
                </div>
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {orders.map(({ ref, order }) => (
                  <li key={ref} className="rounded-3xl border border-border p-5 transition-colors hover:border-ink/30 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-sm font-semibold tracking-wide">{ref}</p>
                        {order && (
                          <p className="mt-1 text-sm text-muted">
                            {order.createdAt && <>{new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })} · </>}
                            {itemCount(order)}
                          </p>
                        )}
                      </div>
                      {order ? <OrderStatusBadge status={order.status} /> : <span className="text-sm text-muted">Status unavailable right now.</span>}
                    </div>
                    {order && (
                      <div className="mt-4 flex items-center gap-4">
                        <ul className="flex shrink-0 -space-x-3" aria-hidden>
                          {order.lines.slice(0, 3).map((l, i) => (
                            <li key={i}><OrderThumb src={l.image} sizes="56px" className="h-14 w-14 rounded-xl ring-2 ring-white" /></li>
                          ))}
                          {order.lines.length > 3 && <li className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-xs font-semibold text-muted ring-2 ring-white">+{order.lines.length - 3}</li>}
                        </ul>
                        <div className="min-w-0 flex-1 text-sm">
                          {productSummary(order) && <p className="line-clamp-2 font-medium text-ink">{productSummary(order)}</p>}
                          <p className="mt-0.5 text-muted">{paymentLabel(order)}</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <Link href={`/order-confirmation/${ref}`} className="btn-secondary min-h-10 px-4 text-sm">View details</Link>
                      <Link href={`/track-order?ref=${ref}`} className="btn-secondary min-h-10 px-4 text-sm">Track</Link>
                      {order && <p className="ml-auto text-lg font-semibold tabular-nums">{formatLkr(order.total)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="profile" className="scroll-mt-40 rounded-3xl bg-surface p-5 sm:p-7" aria-labelledby="profile-title">
            <h2 id="profile-title" className="text-lg font-semibold tracking-tight text-ink">Profile</h2>
            <p className="mt-1 text-sm text-muted">Your name and phone are used to fill in checkout. Email cannot be changed here.</p>
            <div className="mt-5 max-w-md"><ProfileForm name={customer.name} phone={customer.phone} /></div>
            <p className="mt-5 text-sm text-muted">
              <Link href="/account/forgot-password" className="font-semibold text-brand-600 hover:underline">Reset your password</Link>
              {" "}
              by email if you need to change it.
            </p>
          </section>

          <section id="addresses" className="scroll-mt-40 rounded-3xl border border-border p-5 sm:p-7" aria-labelledby="addresses-title">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink"><MapPin className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0">
                <h2 id="addresses-title" className="text-lg font-semibold tracking-tight text-ink">Delivery addresses</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Delivery addresses are entered at checkout and saved with each order. This account does not store an address book.
                  {latest ? " Open an order to see the delivery details you gave for it." : ""}
                </p>
                {latest && <Link href={`/order-confirmation/${latest.ref}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">View your latest order details</Link>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
