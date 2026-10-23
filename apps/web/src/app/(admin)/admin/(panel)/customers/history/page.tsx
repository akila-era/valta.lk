import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ShoppingCart, Users } from "lucide-react";
import { Empty, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { ErpBadge } from "@/components/admin/badges";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Customer order history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; size?: string }> }) {
  const denied = await adminGate("/admin/customers/history");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const sp = await searchParams;
  const size = parseSize(sp.size);
  const where = { customerId: { not: null } };
  const [total, people, value] = await Promise.all([
    db.webOrder.count({ where }),
    db.webOrder.groupBy({ by: ["customerId"], where }).then((g) => g.length),
    db.webOrder.aggregate({ where: { ...where, NOT: { erpStatus: "CANCELLED" } }, _sum: { total: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const rows = await db.webOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, include: { customer: { select: { id: true, name: true, email: true } } } });
  return (
    <>
      <PageHeader title="Customer order history" subtitle="Orders placed while signed in to an account, newest first. Guest orders are on the main orders list." />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat icon={ShoppingCart} tone="orange" label="Orders from accounts" value={total} />
        <Stat icon={Users} tone="blue" label="Customers who ordered" value={people} href="/admin/customers" />
        <Stat icon={Banknote} tone="green" label="Order value (excl. cancelled)" value={formatLkr(Number(value._sum.total ?? 0))} />
      </div>
      {rows.length === 0 ? <Empty>No signed-in customer has placed an order yet.</Empty> : (
        <Table label="Customer order history" min="44rem" head={["Customer", "Order", "Date", { label: "Total", right: true }, "ERP status"]}>
          {rows.map((o) => (
            <tr key={o.externalRef}>
              <td className="px-4 py-3">{o.customer ? <Link href={`/admin/customers/${o.customer.id}`} className="font-medium hover:underline">{o.customer.name}</Link> : "-"}<span className="block text-xs text-muted">{o.customer?.email}</span></td>
              <td className="px-4 py-3 font-mono"><Link href={`/admin/orders/${o.externalRef}`} className="font-semibold text-brand-600 hover:underline">{o.externalRef}</Link></td>
              <td className="whitespace-nowrap px-4 py-3">{o.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(Number(o.total))}</td>
              <td className="px-4 py-3"><ErpBadge status={o.erpStatus} /></td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => `/admin/customers/history?${new URLSearchParams({ ...(size !== 25 ? { size: String(size) } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`} total={total} pageSize={size} noun={total === 1 ? "order" : "orders"} />
    </>
  );
}
