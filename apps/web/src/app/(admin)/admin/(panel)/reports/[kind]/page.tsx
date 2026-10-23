import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Donut, Empty, ErrorNote, PageHeader, Panel, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { catalogue, dashboardData, isLow, isOut, parseRange, RANGES } from "@/lib/admin/stats";
import { formatLkr } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = { orders: "Order reports", products: "Product reports", payments: "Payment reports", erp: "ERP sync reports" };
type Props = { params: Promise<{ kind: string }>; searchParams: Promise<{ range?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: TITLES[(await params).kind] ?? "Reports" };
}

export default async function ReportKindPage({ params, searchParams }: Props) {
  const { kind } = await params;
  const title = TITLES[kind];
  if (!title) notFound();
  const denied = await adminGate(`/admin/reports/${kind}`);
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const range = parseRange((await searchParams).range);
  let d: Awaited<ReturnType<typeof dashboardData>>;
  try {
    d = await dashboardData(db, range);
  } catch {
    return (<><PageHeader title={title} /><ErrorNote>Report data could not be loaded from the website database.</ErrorNote></>);
  }
  const since = new Date(d.generatedAt - range * 86_400_000);

  const rangeNav = (
    <nav aria-label="Date range" className="flex rounded-lg border border-border bg-bg p-0.5 text-sm">
      {RANGES.map((r) => (
        <Link key={r} href={`/admin/reports/${kind}?range=${r}`} aria-current={r === range ? "true" : undefined} className={`rounded-md px-3 py-1.5 font-medium ${r === range ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Last {r} days</Link>
      ))}
    </nav>
  );

  let body: React.ReactNode;
  if (kind === "orders") {
    body = (
      <Panel title="Orders by status" id="status">
        {d.status.length ? <Donut slices={d.status} centre={{ big: String(d.orders.count), small: "Orders" }} label="Orders by status" /> : <Empty>No orders in this period.</Empty>}
      </Panel>
    );
  } else if (kind === "products") {
    const cat = await catalogue();
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Best sellers" id="best">
          {d.top.length === 0 ? <Empty>No sales in this period.</Empty> : (
            <Table label="Best sellers" min="22rem" head={["Product", { label: "Units", right: true }, { label: "Revenue", right: true }]}>
              {d.top.map((t) => (<tr key={t.name}><td className="px-4 py-3">{t.name}</td><td className="px-4 py-3 text-right">{t.units}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(t.revenue)}</td></tr>))}
            </Table>
          )}
        </Panel>
        <Panel title="Catalogue stock position" id="stock">
          {cat ? (
            <dl className="divide-y divide-border text-sm">
              <div className="flex justify-between py-2.5"><dt className="text-muted">Products</dt><dd className="font-semibold">{cat.products.length}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-muted">Low stock</dt><dd className="font-semibold">{cat.products.filter(isLow).length}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-muted">Out of stock</dt><dd className="font-semibold">{cat.products.filter(isOut).length}</dd></div>
            </dl>
          ) : <Empty>The ERP catalogue could not be loaded.</Empty>}
        </Panel>
      </div>
    );
  } else if (kind === "payments") {
    const [col, tc] = await Promise.all([
      db.webOrder.aggregate({ where: { createdAt: { gte: since }, erpPaymentStatus: "COD_COLLECTED" }, _sum: { total: true }, _count: { _all: true } }),
      db.webOrder.aggregate({ where: { createdAt: { gte: since }, syncStatus: "SYNCED", NOT: [{ erpStatus: "CANCELLED" }, { erpPaymentStatus: "COD_COLLECTED" }] }, _sum: { total: true }, _count: { _all: true } }),
    ]);
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Orders by payment method" id="mix">
          {d.payments.length ? <Donut slices={d.payments} centre={{ big: String(d.orders.count), small: "Orders" }} label="Orders by payment method" /> : <Empty>No orders in this period.</Empty>}
        </Panel>
        <Panel title="Cash on delivery" id="cod">
          <dl className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2.5"><dt className="text-muted">Collected ({col._count._all} orders)</dt><dd className="font-semibold text-success">{formatLkr(Number(col._sum.total ?? 0))}</dd></div>
            <div className="flex justify-between py-2.5"><dt className="text-muted">Still to collect ({tc._count._all} orders)</dt><dd className="font-semibold">{formatLkr(Number(tc._sum.total ?? 0))}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">Collected only when the ERP says so. No online payments exist.</p>
        </Panel>
      </div>
    );
  } else {
    const g = await db.webOrder.groupBy({ by: ["syncStatus"], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const label = { SYNCED: "In ERP", PENDING: "Waiting for ERP", FAILED: "Needs attention" } as const;
    const slices = g.map((r) => ({ label: label[r.syncStatus], value: r._count._all }));
    body = (
      <Panel title="Order sync outcome" id="sync">
        {slices.length ? <Donut slices={slices} centre={{ big: String(d.orders.count), small: "Orders" }} label="Orders by ERP sync state" /> : <Empty>No orders in this period.</Empty>}
        <p className="mt-4 text-sm text-muted"><Link href="/admin/erp/failed" className="font-semibold text-brand-600 hover:underline">Failed sync jobs →</Link></p>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader title={title} subtitle="Derived from orders saved on the website and the ERP catalogue. Cancelled orders are excluded from value figures." actions={rangeNav} />
      {body}
    </>
  );
}
