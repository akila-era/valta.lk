import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, ClipboardList, CreditCard, FileText, Package, PieChart, RefreshCw, ShoppingCart, Star, Users, Wallet } from "lucide-react";
import { ErpBadge, SyncBadge } from "@/components/admin/badges";
import { Attention, EmptyPanel, Kpi, RangeTabs, Section } from "@/components/admin/dashboard-ui";
import { BarChart, Donut, ErrorNote, PageHeader, Table } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { paymentLabel } from "@/lib/admin/orders";
import { dashboardData, LOW_STOCK_AT, parseRange, RANGES } from "@/lib/admin/stats";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" });
const ago = (d: Date) => {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const DOT = { green: "bg-success", red: "bg-danger", amber: "bg-warn" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const denied = await adminGate("/admin");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const range = parseRange((await searchParams).range);

  let data: Awaited<ReturnType<typeof dashboardData>>;
  try {
    data = await dashboardData(db, range);
  } catch {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorNote>The dashboard could not load data from the website database. Check that the database is running, then reload.</ErrorNote>
      </>
    );
  }
  const { health } = data;
  const period = `Last ${range} days`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live figures from online-store orders and the HEXALYTE ERP catalogue."
        actions={<RangeTabs ranges={RANGES} current={range} href={(r) => `/admin?range=${r}`} />}
      />

      {!health.reachable && (
        <ErrorNote>
          The ERP did not answer just now, so stock figures may be out of date and new orders are saved here and sent to the ERP when it is back.
        </ErrorNote>
      )}
      {data.products === null && <ErrorNote>The product catalogue could not be loaded from the ERP, so product and stock figures are unavailable.</ErrorNote>}

      <Attention
        items={[
          { label: "orders need attention (ERP rejected)", count: data.attention.failed, href: "/admin/erp/failed", tone: "red" },
          { label: "orders waiting for the ERP", count: data.attention.pending, href: "/admin/orders?status=pending", tone: "amber" },
          { label: "new orders not yet confirmed", count: data.attention.placed, href: "/admin/orders?status=PLACED", tone: "blue" },
          { label: "products out of stock", count: data.attention.out ?? 0, href: "/admin/inventory/out-of-stock", tone: "red" },
          { label: "products low on stock", count: data.attention.low ?? 0, href: "/admin/inventory/low-stock", tone: "amber" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={ShoppingCart} tone="orange" label="Total orders" value={data.orders.count} delta={data.orders.delta} sub={`last ${range} days, including cancelled`} trend={data.ordersPerDay} trendLabel={`Orders per day, last ${range} days`} />
        <Kpi icon={Wallet} tone="green" label="Order value" value={formatLkr(data.revenue.value)} delta={data.revenue.delta} sub="excludes cancelled; cash is not collected yet" trend={data.chart.map((c) => c.value)} trendLabel={`Order value per day, last ${range} days`} />
        <Kpi icon={Wallet} tone="blue" label="Average order value" value={data.aov.value == null ? "—" : formatLkr(data.aov.value)} delta={data.aov.delta} sub="non-cancelled orders only" />
        <Kpi icon={CreditCard} tone="purple" label="Cash still to collect" value={data.pendingPayment} sub="cash on delivery, not yet collected" href="/admin/payments" />
        <Kpi icon={Star} tone="orange" label="Promotion uses" value={data.promotions.redemptions} delta={data.promotions.delta} sub={data.promotions.explained > 0 ? `${formatLkr(data.promotions.explained)} catalogue savings already in the price` : "no advertised offer was recorded"} href="/admin/marketing/promotions" />
        <Kpi icon={Package} tone="green" label="Accessory attachment" value={data.accessories.rate == null ? "—" : `${Math.round(data.accessories.rate * 100)}%`} sub={data.accessories.eligible === 0 ? "no ordered device has a linked accessory" : `${data.accessories.attached} of ${data.accessories.eligible} orders with a linked device`} />
        <Kpi icon={Users} tone="blue" label="Customers" value={data.customers.total} delta={data.customers.delta} sub={`${data.customers.added} new in ${range} days`} href="/admin/customers" />
        <Kpi icon={Package} tone="purple" label="Products" value={data.products ?? "-"} sub="in the ERP catalogue" href="/admin/products" />
        <Kpi icon={AlertTriangle} tone="red" label="Low stock items" value={data.lowStockCount ?? "-"} sub={`${LOW_STOCK_AT} or fewer left`} href="/admin/inventory/low-stock" />
        <Kpi
          icon={RefreshCw}
          tone={health.reachable ? "green" : "red"}
          label="ERP status"
          value={<span className={health.reachable ? "text-success" : "text-danger"}>{health.reachable ? "Connected" : "Unreachable"}</span>}
          sub={data.catalogueSyncedAt ? `Catalogue synced ${ago(data.catalogueSyncedAt)}` : `Checked ${ago(health.checkedAt)}`}
          href="/admin/erp"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Section icon={BarChart3} title="Sales overview" id="sales" period={period}>
          {data.chart.some((c) => c.value > 0) ? (
            <BarChart data={data.chart} format={formatLkr} label={`Order value per day, last ${range} days`} />
          ) : (
            <EmptyPanel icon={BarChart3} title="No sales in this period yet.">Sales figures will appear here once customers place orders on your online store.</EmptyPanel>
          )}
        </Section>
        <Section icon={PieChart} title="Order status overview" id="status" period={period}>
          {data.status.length ? (
            <Donut slices={data.status} centre={{ big: String(data.orders.count), small: "Total orders" }} label="Orders by status" />
          ) : (
            <EmptyPanel icon={PieChart} title="No orders in this period.">The order status breakdown will be shown here once orders are placed.</EmptyPanel>
          )}
        </Section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Section icon={ClipboardList} title="Recent orders" id="recent" action={{ href: "/admin/orders", label: "View all orders" }}>
          {data.recent.length === 0 ? (
            <EmptyPanel icon={FileText} title="No orders have been placed yet.">Customer orders from your online store will appear here once they are received.</EmptyPanel>
          ) : (
            <Table dense label="Recent orders" min="44rem" head={["Order", "Customer", { label: "Total", right: true }, "Payment", "Status", "ERP sync", "Date"]}>
              {data.recent.map((o) => (
                <tr key={o.externalRef}>
                  <td className="px-3 py-3 font-mono"><Link href={`/admin/orders/${o.externalRef}`} className="font-semibold text-brand-600 hover:underline">{o.externalRef}</Link></td>
                  <td className="px-3 py-3">{o.customerName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatLkr(Number(o.total))}</td>
                  <td className="px-3 py-3 text-xs">{paymentLabel(o)}</td>
                  <td className="px-3 py-3"><ErpBadge status={o.erpStatus} /></td>
                  <td className="px-3 py-3"><SyncBadge status={o.syncStatus} /></td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{when(o.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section icon={RefreshCw} title="Recent ERP sync activity" id="timeline" action={{ href: "/admin/erp/orders", label: "View all" }}>
          {data.timeline.length === 0 ? (
            <EmptyPanel icon={RefreshCw} title="No order has been sent to the ERP yet.">Synchronization activity will appear here once orders are placed and sent to the ERP.</EmptyPanel>
          ) : (
            <ol className="space-y-4">
              {data.timeline.map((e) => (
                <li key={e.title + e.at.getTime()} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.tone]}`} aria-hidden />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{e.title}</p>
                    {e.text && <p className="truncate text-xs text-muted" title={e.text}>{e.text}</p>}
                    <p className="text-xs text-muted">{ago(e.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Section icon={Star} title="Top selling products" id="top" action={{ href: "/admin/reports/products", label: "Reports" }}>
          {data.top.length === 0 ? (
            <EmptyPanel icon={Package} title="No sales in this period yet.">Top selling products will appear here once you have customer orders.</EmptyPanel>
          ) : (
            <Table dense label="Top selling products" min="19rem" head={["Product", { label: "Units", right: true }, { label: "Revenue", right: true }]}>
              {data.top.map((t) => (
                <tr key={t.name}>
                  <td className="px-3 py-3">{t.name}</td>
                  <td className="px-3 py-3 text-right">{t.units}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatLkr(t.revenue)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section icon={CreditCard} title="Payment method breakdown" id="pay" action={{ href: "/admin/payments", label: "Payments" }}>
          {data.payments.length === 0 ? (
            <EmptyPanel icon={CreditCard} title="No orders in this period.">Only cash on delivery is enabled. No online payment gateway is connected.</EmptyPanel>
          ) : (
            <>
              <Donut slices={data.payments} centre={{ big: String(data.orders.count), small: "Orders" }} label="Orders by payment method" />
              <p className="mt-4 text-xs text-muted">Only cash on delivery is enabled. No online payment gateway is connected.</p>
            </>
          )}
        </Section>

        <Section icon={AlertTriangle} title="Low stock products" id="low" action={{ href: "/admin/inventory/low-stock", label: "View all" }}>
          {data.products === null ? (
            <EmptyPanel icon={AlertTriangle} title="Stock levels are unavailable.">They will show again once the ERP catalogue can be loaded.</EmptyPanel>
          ) : data.lowStock.length === 0 ? (
            <EmptyPanel icon={Package} title="No products are low on stock.">Products with {LOW_STOCK_AT} or fewer available will be listed here.</EmptyPanel>
          ) : (
            <Table dense label="Low stock products" min="19rem" head={["Product", { label: "Stock", right: true }, "Status"]}>
              {data.lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-3 font-medium">{p.name}</td>
                  <td className="px-3 py-3 text-right font-semibold text-danger">{Math.max(0, p.purchasableQuantity)}</td>
                  <td className="px-3 py-3"><span className={`badge ${p.purchasableQuantity > 0 ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"}`}>{p.purchasableQuantity > 0 ? "Low stock" : "Out of stock"}</span></td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>
      <p className="mt-5 text-xs text-muted">Figures cover online-store orders only. ERP status checked {when(health.checkedAt)}.</p>
    </>
  );
}
