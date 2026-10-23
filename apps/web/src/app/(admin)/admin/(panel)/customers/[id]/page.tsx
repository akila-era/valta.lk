import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CalendarClock, ShoppingCart } from "lucide-react";
import { ErpBadge, SyncBadge } from "@/components/admin/badges";
import { Empty, PageHeader, Panel, Stat, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await adminGate(`/admin/customers/${id}`);
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const c = await db.customer.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, createdAt: true } });
  if (!c) notFound();
  const orders = await db.webOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  const live = orders.filter((o) => o.erpStatus !== "CANCELLED");
  const value = live.reduce((a, o) => a + Number(o.total), 0);
  const initials = c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <Link href="/admin/customers" className="mb-3 inline-block text-sm font-semibold text-brand-600 hover:underline">← Back to customers</Link>
      <PageHeader title="Customer details" />
      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-xl font-bold text-muted" aria-hidden>{initials}</span>
          <div className="min-w-0">
            <p className="text-lg font-bold">{c.name}</p>
            <p className="text-sm text-muted">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
            <p className="text-xs text-muted">Member since {c.createdAt.toLocaleDateString("en-LK", { dateStyle: "long" })}</p>
          </div>
        </div>
      </Panel>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat icon={ShoppingCart} tone="orange" label="Orders" value={orders.length} />
        <Stat icon={Banknote} tone="green" label="Order value (excl. cancelled)" value={formatLkr(value)} />
        <Stat icon={CalendarClock} tone="blue" label="Last order" value={orders[0] ? orders[0].createdAt.toLocaleDateString("en-LK", { dateStyle: "medium" }) : "-"} />
      </div>
      <Panel title="Order history" id="orders">
        {orders.length === 0 ? <Empty>This customer has not placed an order yet.</Empty> : (
          <Table label="Order history" min="40rem" head={["Order", "Date", { label: "Total", right: true }, "Status", "ERP sync"]}>
            {orders.map((o) => (
              <tr key={o.externalRef}>
                <td className="px-4 py-3 font-mono"><Link href={`/admin/orders/${o.externalRef}`} className="font-semibold text-brand-600 hover:underline">{o.externalRef}</Link></td>
                <td className="whitespace-nowrap px-4 py-3">{o.createdAt.toLocaleDateString("en-LK", { dateStyle: "medium" })}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(Number(o.total))}</td>
                <td className="px-4 py-3"><ErpBadge status={o.erpStatus} /></td>
                <td className="px-4 py-3"><SyncBadge status={o.syncStatus} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
