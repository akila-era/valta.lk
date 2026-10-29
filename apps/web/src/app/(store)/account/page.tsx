import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Headset, Heart, KeyRound, LayoutDashboard, MapPin, Package, PackageSearch, ShoppingBag, Truck, UserRound, Wallet, XCircle, type LucideIcon } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { ProfileForm } from "@/components/account/profile-form";
import { SignOutButton } from "@/components/account/sign-out-button";
import { orderRefsFor } from "@/lib/auth/accounts";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { PublicOrder } from "@/lib/erp/order-tracking";
import { loadOrderView } from "@/lib/orders/public";
import { addMoney, formatLkr } from "@/lib/utils/money";
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

const STATUS_TONE: Record<string, string> = {
  CANCELLED: "bg-danger/10 text-danger",
  DELIVERED: "bg-success-bg text-success",
  RECEIVED: "bg-warn-bg text-warn",
  DISPATCHED: "bg-ink text-white",
};

/** The delivery journey shown on each order card. RECEIVED (not yet in the ERP) counts as the first step. */
const STEPS = [
  { key: "PLACED", label: "Placed", icon: ShoppingBag },
  { key: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { key: "DISPATCHED", label: "Dispatched", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: Package },
] as const;
const stepIndex = (status: string) => Math.max(0, STEPS.findIndex((s) => s.key === (status === "RECEIVED" ? "PLACED" : status)));

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#orders", label: "My orders", icon: Package },
  { href: "#profile", label: "Profile", icon: UserRound },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/track-order", label: "Track an order", icon: PackageSearch },
];

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
  if (order.paymentMethod === "COD") return order.codCollected ? "Paid · cash collected" : "Cash on delivery · pay when it arrives";
  return order.paymentMethod;
}

function displayPhone(phone: string | null) {
  return phone?.replace(/^\+94/, "0") ?? null;
}

/** One figure in the summary row under the welcome panel. */
function StatTile({ icon: Icon, label, value, note, className = "" }: { icon: LucideIcon; label: string; value: string; note: string; className?: string }) {
  return (
    <li className={`flex min-w-0 items-center gap-4 rounded-card border border-border bg-bg p-3.5 sm:p-5 ${className}`}>
      <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 xl:flex">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted sm:text-xs">{label}</span>
        <span className="block break-words font-display text-lg font-extrabold leading-tight tabular-nums text-ink sm:text-xl xl:text-2xl">{value}</span>
        <span className="hidden truncate text-xs text-muted sm:block">{note}</span>
      </span>
    </li>
  );
}

/** A shortcut tile (track, wishlist, shop, help). */
function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <li>
      <Link href={href} className="group flex h-full items-center gap-3 rounded-card border border-border bg-bg p-3 transition-[border-color,box-shadow] hover:border-brand-500 hover:shadow-neon-lift sm:p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ink text-white transition-colors group-hover:bg-brand-500">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight text-ink sm:text-sm">{title}</span>
          <span className="hidden truncate text-xs text-muted sm:block">{text}</span>
        </span>
        <ArrowRight className="hidden h-4 w-4 shrink-0 sm:block text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
      </Link>
    </li>
  );
}

/** Placed → Confirmed → Dispatched → Delivered, filled up to the order's current step. */
function OrderProgress({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <p className="mt-4 inline-flex items-center gap-2 rounded-control bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
        <XCircle className="h-4 w-4" aria-hidden /> This order was cancelled.
      </p>
    );
  }
  const at = stepIndex(status);
  return (
    <ol className="mt-5 grid grid-cols-4" aria-label={`Progress: ${STEPS[at].label}`}>
      {STEPS.map((s, i) => {
        const done = i <= at;
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center">
            {i > 0 ? <span aria-hidden className={`absolute right-1/2 top-4 h-[3px] w-full -translate-y-1/2 ${i <= at ? "bg-brand-500" : "bg-border"}`} /> : null}
            <span aria-hidden className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${done ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-bg text-muted"} ${i === at ? "ring-4 ring-brand-500/20" : ""}`}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className={`mt-1.5 text-[11px] font-semibold sm:text-xs ${done ? "text-ink" : "text-muted"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
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
  const first = customer.name.trim().split(/\s+/)[0];
  const known = orders.flatMap((o) => (o.order ? [o.order] : []));
  const active = known.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED").length;
  const spent = addMoney(...known.filter((o) => o.status !== "CANCELLED").map((o) => o.total));

  return (
    <div className="space-y-8">
      <StoreHeroBanner
        title="My account"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Account" }]}
        intro="Your orders, delivery progress and profile in one place."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Sidebar: who is signed in, the sections, and sign out */}
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)]">
          <nav aria-label="Account" className="rounded-panel border border-border bg-bg p-2.5">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
              {NAV.map((item, i) => (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={i === 0 ? "page" : undefined}
                    className={`group relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-control px-3.5 text-sm font-semibold transition-colors ${
                      i === 0 ? "bg-brand-50 text-brand-700" : "text-ink/75 hover:bg-surface hover:text-ink"
                    }`}
                  >
                    {i === 0 ? <span aria-hidden className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-brand-500 lg:block" /> : null}
                    <item.icon className={`h-[18px] w-[18px] ${i === 0 ? "text-brand-600" : "text-muted group-hover:text-brand-600"}`} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 hidden border-t border-border px-1.5 pt-3 lg:block">
              <SignOutButton className="btn-ghost min-h-10 w-full justify-start px-2 text-sm text-danger hover:bg-danger/5" />
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          {/* Welcome panel */}
          <section id="overview" aria-labelledby="account-name" className="relative scroll-mt-40 overflow-hidden rounded-panel bg-ink p-6 text-white sm:p-8">
            <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
            <span aria-hidden className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full border border-white/10" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-2xl font-extrabold uppercase text-white shadow-neon sm:h-20 sm:w-20 sm:text-3xl">
                  {first.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-500">Welcome back</p>
                  <h2 id="account-name" className="mt-1 truncate font-display text-2xl font-extrabold tracking-title sm:text-3xl">{customer.name}</h2>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-white/70">
                    <span className="break-all">{customer.email}</span>
                    {phone ? <span>{phone}</span> : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 sm:shrink-0">
                <Link href="/products" className="btn-primary min-h-11 px-5">
                  <ShoppingBag className="h-4 w-4" aria-hidden /> Shop now
                </Link>
                <div className="lg:hidden">
                  <SignOutButton className="btn min-h-11 border border-white/25 px-5 text-white hover:bg-white hover:text-ink" />
                </div>
              </div>
            </div>
          </section>

          {/* Summary figures */}
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4" aria-label="Your account at a glance">
            <StatTile icon={Package} label="Orders" value={String(orders.length)} note={orders.length ? "linked to this account" : "none yet"} />
            <StatTile icon={Clock} label="In progress" value={String(active)} note={active ? "on the way to you" : "nothing pending"} />
            <StatTile icon={Wallet} label="Total spent" value={formatLkr(spent)} note="excluding cancelled orders" className="col-span-2 sm:col-span-1" />
          </ul>

          {/* Shortcuts */}
          <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4" aria-label="Shortcuts">
            <QuickLink href="/track-order" icon={PackageSearch} title="Track an order" text="Live delivery status" />
            <QuickLink href="/wishlist" icon={Heart} title="Wishlist" text="Items you saved" />
            <QuickLink href="/products?sale=1" icon={ShoppingBag} title="Hot deals" text="Current price drops" />
            <QuickLink href="/contact" icon={Headset} title="Need help?" text="Talk to our team" />
          </ul>

          {/* Orders */}
          <section id="orders" aria-labelledby="orders-title" className="scroll-mt-40">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="eyebrow">Purchases</p>
                <h2 id="orders-title" className="font-display text-2xl font-extrabold tracking-title text-ink">My orders</h2>
              </div>
              <p className="text-xs text-muted">Statuses come live from our order system.</p>
            </div>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-bg px-6 py-12 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-neon">
                  <Package className="h-7 w-7" aria-hidden />
                </span>
                <p className="mt-1 font-display text-lg font-extrabold text-ink">No orders yet</p>
                <p className="max-w-sm text-sm leading-6 text-muted">Orders you place while signed in appear here. Guest orders can still be checked with the order reference.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2.5">
                  <Link href="/products" className="btn-primary min-h-11 px-5">Start shopping</Link>
                  <Link href="/track-order" className="btn-secondary min-h-11 px-5">Track an order</Link>
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {orders.map(({ ref, order }) => (
                  <li key={ref} className="rounded-panel border border-border bg-bg p-5 transition-[border-color,box-shadow] hover:border-brand-500 hover:shadow-neon-lift sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-mono text-sm font-bold tracking-wide text-ink">{ref}</span>
                          {order ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[order.status] ?? "bg-brand-50 text-brand-700"}`}>
                              {STATUS_LABEL[order.status] ?? order.status}
                            </span>
                          ) : null}
                        </div>
                        {order ? (
                          <>
                            {productSummary(order) ? <p className="mt-2 text-[15px] font-semibold text-ink">{productSummary(order)}</p> : null}
                            <p className="mt-1 text-xs text-muted">
                              {order.createdAt ? `${new Date(order.createdAt).toLocaleDateString("en-LK", { dateStyle: "medium" })} · ` : ""}
                              {itemCount(order)} · {paymentLabel(order)}
                            </p>
                            {order.trackingNumber ? (
                              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                                <MapPin className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                                {order.carrier ? `${order.carrier} · ` : ""}Tracking {order.trackingNumber}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-2 text-xs text-muted">Status unavailable right now. Please try again shortly.</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {order ? <p className="font-display text-xl font-extrabold tabular-nums text-brand-600">{formatLkr(order.total)}</p> : null}
                        <Link href={`/track-order?ref=${ref}`} className="btn-secondary min-h-10 px-4 text-[13px]">
                          Track order <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </div>
                    </div>
                    {order ? <OrderProgress status={order.status} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Profile */}
          <section id="profile" aria-labelledby="profile-title" className="scroll-mt-40 rounded-panel border border-border bg-bg p-6 sm:p-8">
            <p className="eyebrow">Your details</p>
            <h2 id="profile-title" className="font-display text-2xl font-extrabold tracking-title text-ink">Profile</h2>
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0 max-w-lg">
                <p className="mb-5 text-sm text-muted">Your name and phone fill in checkout for you. The email address cannot be changed.</p>
                <ProfileForm name={customer.name} phone={customer.phone} />
              </div>
              <ul className="space-y-3 text-sm">
                <li className="rounded-card bg-surface p-4">
                  <p className="flex items-center gap-2 font-bold text-ink"><KeyRound className="h-4 w-4 text-brand-600" aria-hidden /> Password</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Change it with a reset link sent to your email.</p>
                  <Link href="/account/forgot-password" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
                    Reset password <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
                <li className="rounded-card bg-surface p-4">
                  <p className="flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-brand-600" aria-hidden /> Delivery address</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Entered at checkout for each order. No address book is stored.</p>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
