import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pager, SearchForm, Stat, Table } from "@/components/admin/ui";
import { CalendarPlus, ShoppingCart, Users } from "lucide-react";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { formatLkr } from "@/lib/utils/money";
import { parseSize } from "@/lib/admin/paging";
import { customerCounts } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; size?: string }> }) {
  const denied = await adminGate("/admin/customers");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const sp = await searchParams;
  const size = parseSize(sp.size);
  const q = sp.q?.trim().slice(0, 60);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q.replace(/[\s-]/g, "") } }] } : {};
  const { all, withOrders, recent } = await customerCounts(db);
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Math.max(1, Number(sp.page) || 1) - 1) * size, take: size, include: { _count: { select: { webOrders: true } } } }),
  ]);
  const spent = new Map((await db.webOrder.groupBy({ by: ["customerId"], where: { customerId: { in: rows.map((r) => r.id) }, NOT: { erpStatus: "CANCELLED" } }, _sum: { total: true }, _max: { createdAt: true } })).map((g) => [g.customerId, g]));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));

  return (
    <>
      <PageHeader title="Customers" subtitle="Registered website accounts. Guest checkouts do not create an account; they appear on the orders list only." />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat icon={Users} tone="blue" label="Registered customers" value={all} />
        <Stat icon={ShoppingCart} tone="orange" label="Have placed an order" value={withOrders} href="/admin/customers/history" />
        <Stat icon={CalendarPlus} tone="green" label="New in 30 days" value={recent} />
      </div>
      <div className="mb-4"><SearchForm action="/admin/customers" q={q} placeholder="Search name, email or phone" /></div>
      <p className="mb-3 text-sm text-muted" role="status">{total} {total === 1 ? "customer" : "customers"}</p>
      {rows.length === 0 ? (
        <Empty>{q ? "No customers match this search." : "No customer has registered yet."}</Empty>
      ) : (
        <Table dense label="Customers" min="52rem" head={["Customer", "Phone", { label: "Orders", right: true }, { label: "Order value", right: true }, "Last order", "Joined"]}>
          {rows.map((c) => {
            const g = spent.get(c.id);
            return (
              <tr key={c.id}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-muted" aria-hidden>{c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                    <div className="min-w-0">
                      <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      <span className="block truncate text-xs text-muted">{c.email}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{c.phone ?? "-"}</td>
                <td className="px-3 py-3 text-right font-semibold">{c._count.webOrders}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{g?._sum.total ? formatLkr(Number(g._sum.total)) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{g?._max.createdAt ? g._max.createdAt.toLocaleDateString("en-LK", { dateStyle: "medium" }) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{c.createdAt.toLocaleDateString("en-LK", { dateStyle: "medium" })}</td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(size !== 25 ? { size: String(size) } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`} total={total} pageSize={size} noun={total === 1 ? "customer" : "customers"} />
    </>
  );
}
