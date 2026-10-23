import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ErpBadge, SyncBadge } from "@/components/admin/badges";
import { Empty, PageHeader, Pager, Stat, Table, Toolbar } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { adminQuerySchema, ERP_FILTERS, listOrders, paymentLabel, refreshFromErp, SYNC_FILTERS } from "@/lib/admin/orders";
import type { DisplayLine } from "@/lib/orders/web-orders";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All orders" },
  ...SYNC_FILTERS.map((v) => ({ value: v, label: v === "pending" ? "Sync: waiting for ERP" : v === "failed" ? "Sync: needs attention" : "Sync: in ERP" })),
  ...ERP_FILTERS.map((v) => ({ value: v, label: `ERP: ${v.charAt(0)}${v.slice(1).toLowerCase()}` })),
];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const denied = await adminGate("/admin/orders");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;

  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = adminQuerySchema.parse({ status: first(raw.status), from: first(raw.from), to: first(raw.to), q: first(raw.q), page: first(raw.page), size: first(raw.size) });
  const { rows: listed, total, pageCount, bySync } = await listOrders(db, q);
  const rows = await refreshFromErp(db, listed);
  const filtered = Boolean(q.status || q.from || q.to || q.q);

  const href = (page: number) => {
    const p = new URLSearchParams();
    if (q.status) p.set("status", q.status);
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    if (q.q) p.set("q", q.q);
    if (q.size !== 25) p.set("size", String(q.size));
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <>
      <PageHeader title="Orders" subtitle="Online-store orders. Status, stock and COD collection come from the ERP; the sync column shows whether an order has reached it." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3" role="group" aria-label="Sync summary">
        <Stat icon={CheckCircle2} tone="green" label="In ERP" value={<span data-testid="count-synced">{bySync.SYNCED ?? 0}</span>} href="/admin/orders?status=synced" />
        <Stat icon={Clock} tone="orange" label="Waiting for ERP" value={<span data-testid="count-pending">{bySync.PENDING ?? 0}</span>} href="/admin/orders?status=pending" />
        <Stat icon={XCircle} tone="red" label="Need attention" value={<span data-testid="count-failed">{bySync.FAILED ?? 0}</span>} href="/admin/orders?status=failed" />
      </div>

      <form method="get" action="/admin/orders">
        <Toolbar>
          <div className="w-full sm:w-52">
            <label htmlFor="f-status" className="label">Status</label>
            <select id="f-status" name="status" defaultValue={q.status ?? ""} className="input">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="min-w-[9rem] flex-1 sm:flex-none">
            <label htmlFor="f-from" className="label">From</label>
            <input id="f-from" name="from" type="date" defaultValue={q.from} className="input" />
          </div>
          <div className="min-w-[9rem] flex-1 sm:flex-none">
            <label htmlFor="f-to" className="label">To</label>
            <input id="f-to" name="to" type="date" defaultValue={q.to} className="input" />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="f-q" className="label">Order, name or phone</label>
            <input id="f-q" name="q" defaultValue={q.q} maxLength={60} className="input" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit">Filter</button>
            {filtered && <Link href="/admin/orders" className="btn-secondary">Clear</Link>}
          </div>
        </Toolbar>
      </form>

      <p className="mb-3 text-sm text-muted" role="status">{total} {total === 1 ? "order" : "orders"}{filtered ? " match" : ""}</p>
      {rows.length === 0 ? (
        <Empty>{filtered ? "No orders match these filters." : "No orders yet. They appear here as soon as customers place them."}</Empty>
      ) : (
        <Table label="Orders" min="62rem" head={["Order", "Placed", "Customer", { label: "Items", right: true }, { label: "Total", right: true }, "Payment", "ERP status", "Sync"]}>
          {rows.map((r) => (
            <tr key={r.externalRef} data-testid="admin-order-row">
              <td className="px-4 py-3 font-mono"><Link href={`/admin/orders/${r.externalRef}`} className="font-semibold text-brand-600 hover:underline">{r.externalRef}</Link></td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="px-4 py-3 font-medium">{r.customerName}<span className="block text-xs font-normal text-muted">{r.customerPhone}</span></td>
              <td className="px-4 py-3 text-right" title={((r.items as unknown as DisplayLine[]) ?? []).map((l) => `${l.name} × ${l.quantity}`).join(", ")}>{((r.items as unknown as DisplayLine[]) ?? []).reduce((n, l) => n + l.quantity, 0)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(Number(r.total))}</td>
              <td className="px-4 py-3">{paymentLabel(r)}</td>
              <td className="px-4 py-3"><ErpBadge status={r.erpStatus} /></td>
              <td className="px-4 py-3"><SyncBadge status={r.syncStatus} />{r.syncStatus !== "SYNCED" && r.lastError && <span className="mt-1 block max-w-[16rem] text-xs text-muted">{r.lastError}</span>}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={q.page} pageCount={pageCount} href={href} total={total} pageSize={q.size} noun={total === 1 ? "order" : "orders"} />
    </>
  );
}
