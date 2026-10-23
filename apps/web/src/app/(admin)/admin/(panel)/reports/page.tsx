import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, Empty, ErrorNote, PageHeader, Panel, Stat, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { dashboardData, parseRange, RANGES } from "@/lib/admin/stats";
import { formatLkr } from "@/lib/utils/money";
import { ShoppingCart, Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const denied = await adminGate("/admin/reports");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const range = parseRange((await searchParams).range);
  let d: Awaited<ReturnType<typeof dashboardData>>;
  try {
    d = await dashboardData(db, range);
  } catch {
    return (<><PageHeader title="Reports" /><ErrorNote>Report data could not be loaded from the website database.</ErrorNote></>);
  }
  const days = d.chart.filter((x) => x.value > 0);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Online-store sales from orders saved on the website (cancelled orders excluded). Order value is not collected cash: COD is only collected on delivery."
        actions={
          <nav aria-label="Date range" className="flex rounded-lg border border-border bg-bg p-0.5 text-sm">
            {RANGES.map((r) => (
              <Link key={r} href={`/admin/reports?range=${r}`} aria-current={r === range ? "true" : undefined} className={`rounded-md px-3 py-1.5 font-medium ${r === range ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Last {r} days</Link>
            ))}
          </nav>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ShoppingCart} tone="orange" label="Orders" value={d.orders.count} delta={d.orders.delta} />
        <Stat icon={Wallet} tone="green" label="Order value" value={formatLkr(d.revenue.value)} delta={d.revenue.delta} />
        <Stat icon={Wallet} tone="blue" label="Average order value" value={d.aov.value == null ? "—" : formatLkr(d.aov.value)} delta={d.aov.delta} />
        <Stat icon={ShoppingCart} tone="purple" label="Accessory attachment" value={d.accessories.rate == null ? "—" : `${Math.round(d.accessories.rate * 100)}%`} />
      </div>
      <p className="mt-3 text-xs text-muted">
        Average order value uses non-cancelled orders. Accessory attachment counts an order only when it contains a device that has an explicit accessory link, and that linked accessory is in the same order.
        {d.promotions.redemptions === 0 ? " No promotion redemptions were recorded in this period." : ` ${d.promotions.redemptions} promotion ${d.promotions.redemptions === 1 ? "use" : "uses"} explained ${formatLkr(d.promotions.explained)} of catalogue savings already included in the price.`}
        {" "}{d.pendingPayment} cash-on-delivery {d.pendingPayment === 1 ? "order is" : "orders are"} still to collect.
      </p>
      <Panel className="mt-6" title="Order value per day" id="daily"><BarChart data={d.chart} format={formatLkr} label="Order value per day" /></Panel>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Best sellers" id="best">
          {d.top.length === 0 ? <Empty>No sales in this period.</Empty> : (
            <Table label="Best sellers" min="22rem" head={["Product", { label: "Units", right: true }, { label: "Revenue", right: true }]}>
              {d.top.map((t) => (<tr key={t.name}><td className="px-4 py-3">{t.name}</td><td className="px-4 py-3 text-right">{t.units}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatLkr(t.revenue)}</td></tr>))}
            </Table>
          )}
        </Panel>
        <Panel title="Days with sales" id="days">
          {days.length === 0 ? <Empty>No sales in this period.</Empty> : (
            <Table label="Days with sales" min="18rem" head={["Day", { label: "Order value", right: true }]}>
              {[...days].reverse().slice(0, 15).map((x, i) => (<tr key={x.label + i}><td className="px-4 py-3">{x.label}</td><td className="px-4 py-3 text-right font-semibold">{formatLkr(x.value)}</td></tr>))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
