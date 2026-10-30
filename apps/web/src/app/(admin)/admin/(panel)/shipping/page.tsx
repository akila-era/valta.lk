import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, PackageCheck, Search, Truck, Wallet } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { ErpBadge } from "@/components/admin/badges";
import { CopyButton } from "@/components/admin/copy-button";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { getSettings } from "@/lib/erp/settings";
import type { CreateOrderRequest } from "@/lib/erp/types";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Shipments" };
export const dynamic = "force-dynamic";

const FILTERS = [["", "All"], ["awaiting", "Awaiting dispatch"], ["dispatched", "Dispatched"], ["delivered", "Delivered"]] as const;
type SP = { status?: string; q?: string; page?: string; size?: string };

const awaiting: Prisma.WebOrderWhereInput = { erpStatus: { in: ["PLACED", "CONFIRMED"] } };
const dispatched: Prisma.WebOrderWhereInput = { erpStatus: "DISPATCHED" };
const delivered: Prisma.WebOrderWhereInput = { erpStatus: "DELIVERED" };

export default async function ShippingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/shipping");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const sp = await searchParams;
  const status = FILTERS.some(([v]) => v === sp.status) ? (sp.status ?? "") : "";
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const size = parseSize(sp.size);

  const and: Prisma.WebOrderWhereInput[] = [{ erpStatus: { in: ["PLACED", "CONFIRMED", "DISPATCHED", "DELIVERED"] } }];
  if (status === "awaiting") and.push(awaiting);
  if (status === "dispatched") and.push(dispatched);
  if (status === "delivered") and.push(delivered);
  if (q) and.push({ OR: [{ externalRef: { contains: q.toUpperCase() } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q.replace(/[\s-]/g, "") } }, { trackingNumber: { contains: q, mode: "insensitive" } }] });
  const where: Prisma.WebOrderWhereInput = { AND: and };

  const [settings, total, nAwaiting, nDispatched, nDelivered] = await Promise.all([
    getSettings({ fresh: true }).catch(() => null),
    db.webOrder.count({ where }),
    db.webOrder.count({ where: awaiting }),
    db.webOrder.count({ where: dispatched }),
    db.webOrder.count({ where: delivered }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const rows = await db.webOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size });

  const url = (o: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = "status" in o ? o.status : status;
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if (size !== 25) p.set("size", String(size));
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/admin/shipping${p.size ? `?${p}` : ""}`;
  };
  const filtered = Boolean(status || q);

  return (
    <>
      <PageHeader title="Shipments" subtitle="Dispatch, carrier and tracking number are recorded in the ERP. This page shows what the website received." />
      {!settings && <ErrorNote>The ERP settings could not be read, so the delivery charge is unknown right now.</ErrorNote>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={PackageCheck} tone="orange" label="Awaiting dispatch" value={nAwaiting} href={url({ status: "awaiting", page: 1 })} />
        <Stat icon={Truck} tone="blue" label="Dispatched" value={nDispatched} href={url({ status: "dispatched", page: 1 })} />
        <Stat icon={CheckCircle2} tone="green" label="Delivered" value={nDelivered} href={url({ status: "delivered", page: 1 })} />
        <Stat icon={Wallet} tone="purple" label="Delivery charge" value={settings ? formatLkr(settings.deliveryCharge) : "-"} sub="flat, set in the ERP" />
      </div>

      <form action="/admin/shipping" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {status && <input type="hidden" name="status" value={status} />}
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="sh-q" className="sr-only">Search by order, customer, phone or tracking number</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="sh-q" name="q" defaultValue={q} maxLength={60} placeholder="Search order, customer, phone or tracking number…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <nav aria-label="Shipment status" className="flex flex-wrap gap-1 text-sm">
          {FILTERS.map(([v, l]) => {
            const on = status === v;
            return <Link key={v} href={url({ status: v, page: 1 })} aria-current={on ? "true" : undefined} className={`inline-flex min-h-10 items-center rounded-control border px-3.5 font-semibold transition-colors ${on ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-bg hover:border-brand-500 hover:text-brand-700"}`}>{l}</Link>;
          })}
        </nav>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {filtered && <Link href="/admin/shipping" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      <p className="mb-3 text-sm text-muted" role="status">{total} {total === 1 ? "shipment" : "shipments"}{filtered ? " match" : ""}</p>
      {rows.length === 0 ? (
        <Empty>{filtered ? "No shipments match." : "No orders have reached the ERP yet."}</Empty>
      ) : (
        <Table dense label="Shipments" min="62rem" head={["Order", "Customer", "Deliver to", "Status", "Carrier", "Tracking number", "Placed"]}>
          {rows.map((o) => {
            const d = (o.payload as unknown as CreateOrderRequest).delivery;
            return (
              <tr key={o.externalRef}>
                <td className="px-3 py-3 font-mono"><Link href={`/admin/orders/${o.externalRef}`} className="font-semibold text-brand-600 hover:underline">{o.externalRef}</Link></td>
                <td className="px-3 py-3 font-medium">{o.customerName}<span className="block text-xs font-normal text-muted">{o.customerPhone}</span></td>
                <td className="max-w-[16rem] px-3 py-3 text-muted">{d ? `${d.addressLine1}, ${d.city}` : "-"}<span className="block text-xs">{d?.district}</span></td>
                <td className="px-3 py-3"><ErpBadge status={o.erpStatus} /></td>
                <td className="px-3 py-3">{o.carrierName ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-xs">{o.trackingNumber ? <span className="inline-flex items-center gap-1">{o.trackingNumber}<CopyButton value={o.trackingNumber} label="tracking number" /></span> : "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{o.createdAt.toLocaleDateString("en-LK", { dateStyle: "medium" })}</td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => url({ page: n })} total={total} pageSize={size} noun={total === 1 ? "shipment" : "shipments"} />
    </>
  );
}
