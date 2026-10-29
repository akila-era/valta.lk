import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { NoOrders, OrderCard } from "@/components/account/order-card";
import { accountOrders } from "@/lib/account/orders";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

/** Every order placed while signed in, with its live status and delivery progress. */
export default async function AccountOrdersPage() {
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login?next=/account/orders");
  const orders = await accountOrders(customer.id);

  return (
    <AccountShell section="orders">
      <section aria-labelledby="orders-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Purchases</p>
            <h2 id="orders-title" className="font-display text-2xl font-extrabold tracking-title text-ink">
              {orders.length ? `${orders.length} ${orders.length === 1 ? "order" : "orders"}` : "Orders"}
            </h2>
          </div>
          <p className="text-xs text-muted">Statuses come live from our order system.</p>
        </div>
        {orders.length === 0 ? (
          <NoOrders />
        ) : (
          <ul className="space-y-4">
            {orders.map(({ ref, order }) => (
              <OrderCard key={ref} orderRef={ref} order={order} />
            ))}
          </ul>
        )}
      </section>
    </AccountShell>
  );
}
