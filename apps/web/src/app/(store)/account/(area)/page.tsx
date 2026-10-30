import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, Headset, Heart, Package, PackageSearch, ShoppingBag, Wallet, type LucideIcon } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { NoOrders, OrderCard } from "@/components/account/order-card";
import { SignOutButton } from "@/components/account/sign-out-button";
import { accountOrders } from "@/lib/account/orders";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { addMoney, formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

/** How many of the latest orders the overview shows (all of them are on My orders). */
const RECENT = 2;

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

/** A shortcut tile (track, wishlist, deals, help). */
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
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 sm:block" aria-hidden />
      </Link>
    </li>
  );
}

/** Account overview: welcome panel, summary figures, shortcuts and the latest orders. */
export default async function AccountPage() {
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login?next=/account");

  const orders = await accountOrders(customer.id);
  const phone = customer.phone?.replace(/^\+94/, "0") ?? null;
  const first = customer.name.trim().split(/\s+/)[0];
  const known = orders.flatMap((o) => (o.order ? [o.order] : []));
  const active = known.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED").length;
  const spent = addMoney(...known.filter((o) => o.status !== "CANCELLED").map((o) => o.total));

  return (
    <>
      {/* Welcome panel */}
      <section aria-labelledby="account-name" className="relative overflow-hidden rounded-panel bg-ink p-6 text-white sm:p-8">
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

      {/* Latest orders */}
      <section aria-labelledby="recent-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Purchases</p>
            <h2 id="recent-title" className="font-display text-2xl font-extrabold tracking-title text-ink">Recent orders</h2>
          </div>
          {orders.length > RECENT ? (
            <Link href="/account/orders" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
              View all {orders.length} orders <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        {orders.length === 0 ? (
          <NoOrders />
        ) : (
          <ul className="space-y-4">
            {orders.slice(0, RECENT).map(({ ref, order }) => (
              <OrderCard key={ref} orderRef={ref} order={order} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
