import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Clock, Hourglass, Receipt, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { ErpBadge, PaymentBadge } from "@/components/admin/badges";
import { Empty, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const FILTERS = [["", "All"], ["collected", "Collected"], ["to-collect", "To collect"], ["unsent", "Not yet in ERP"]] as const;
type SP = { filter?: string; q?: string; page?: string; size?: string };

const toCollect: Prisma.WebOrderWhereInput = { syncStatus: "SYNCED", NOT: [{ erpPaymentStatus: "COD_COLLECTED" }, { erpStatus: "CANCELLED" }] };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/payments/transactions");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const sp = await searchParams;
  const f = FILTERS.some(([v]) => v === sp.filter) ? (sp.filter ?? "") : "";
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const size = parseSize(sp.size);

  const and: Prisma.WebOrderWhereInput[] = [];
  if (f === "collected") and.push({ erpPaymentStatus: "COD_COLLECTED" });
  if (f === "to-collect") and.push(toCollect);
  if (f === "unsent") and.push({ syncStatus: { not: "SYNCED" } });
  if (q) and.push({ OR: [{ externalRef: { contains: q.toUpperCase() } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q.replace(/[\s-]/g, "") } }] });
  const where: Prisma.WebOrderWhereInput = and.length ? { AND: and } : {};

  const live = { NOT: { erpStatus: "CANCELLED" } };
  const [total, collected, pending, unsent, all] = await Promise.all([
    db.webOrder.count({ where }),
    db.webOrder.aggregate({ where: { ...live, erpPaymentStatus: "COD_COLLECTED" }, _sum: { total: true }, _count: { _all: true } }),
    db.webOrder.aggregate({ where: toCollect, _sum: { total: true }, _count: { _all: true } }),
    db.webOrder.aggregate({ where: { syncStatus: { not: "SYNCED" } }, _sum: { total: true }, _count: { _all: true } }),
    db.webOrder.count(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const rows = await db.webOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size });
  const money = (v: unknown) => formatLkr(Number(v ?? 0));

  const url = (o: { filter?: string; page?: number }) => {
    const p = new URLSearchParams();
    const flt = "filter" in o ? o.filter : f;
    if (flt) p.set("filter", flt);
    if (q) p.set("q", q);
    if (size !== 25) p.set("size", String(size));
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/admin/payments/transactions${p.size ? `?${p}` : ""}`;
  };
  const filtered = Boolean(f || q);

  return (
    <>
      <PageHeader title="Transactions" subtitle="One row per order. Cash on delivery is only counted as collected once the ERP says so." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Receipt} tone="purple" label="All transactions" value={all} href={url({ filter: "", page: 1 })} />
        <Stat icon={Banknote} tone="green" label="Cash collected" value={money(collected._sum.total)} sub={`${collected._count._all} orders`} href={url({ filter: "collected", page: 1 })} />
        <Stat icon={Clock} tone="orange" label="To collect" value={money(pending._sum.total)} sub={`${pending._count._all} orders in the ERP`} href={url({ filter: "to-collect", page: 1 })} />
        <Stat icon={Hourglass} tone="red" label="Not yet in ERP" value={money(unsent._sum.total)} sub={`${unsent._count._all} orders waiting`} href={url({ filter: "unsent", page: 1 })} />
      </div>

      <form action="/admin/payments/transactions" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {f && <input type="hidden" name="filter" value={f} />}
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="t-q" className="sr-only">Search by order number, customer name or phone</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="t-q" name="q" defaultValue={q} maxLength={60} placeholder="Search order, customer name or phone…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <nav aria-label="Payment filter" className="flex flex-wrap gap-1 text-sm">
          {FILTERS.map(([v, l]) => {
            const on = f === v;
            return <Link key={v} href={url({ filter: v, page: 1 })} aria-current={on ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-lg border px-3 font-medium ${on ? "border-ink bg-ink text-white" : "border-border bg-bg hover:border-ink"}`}>{l}</Link>;
          })}
        </nav>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {filtered && <Link href="/admin/payments/transactions" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      <p className="mb-3 text-sm text-muted" role="status">{total} {total === 1 ? "transaction" : "transactions"}{filtered ? " match" : ""}</p>
      {rows.length === 0 ? (
        <Empty>{filtered ? "No transactions match." : "No orders yet, so there are no transactions."}</Empty>
      ) : (
        <Table dense label="Transactions" min="54rem" head={["Order", "Customer", "Date", "Method", { label: "Amount", right: true }, "Payment", "Order status"]}>
          {rows.map((r) => (
            <tr key={r.externalRef}>
              <td className="px-3 py-3 font-mono"><Link href={`/admin/orders/${r.externalRef}`} className="font-semibold text-brand-600 hover:underline">{r.externalRef}</Link></td>
              <td className="px-3 py-3 font-medium">{r.customerName}<span className="block text-xs font-normal text-muted">{r.customerPhone}</span></td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-3 py-3">{r.paymentMethod === "COD" ? "Cash on delivery" : r.paymentMethod}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatLkr(Number(r.total))}</td>
              <td className="px-3 py-3"><PaymentBadge row={r} /></td>
              <td className="px-3 py-3"><ErpBadge status={r.erpStatus} /></td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => url({ page: n })} total={total} pageSize={size} noun={total === 1 ? "transaction" : "transactions"} />
    </>
  );
}
