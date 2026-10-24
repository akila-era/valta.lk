import type { Metadata } from "next";
import { Eye, Funnel, LineChart, MousePointerClick, Wallet } from "lucide-react";
import {
  Card,
  FunnelBars,
  FunnelKpis,
  FunnelTrend,
  NotCollectedPanel,
  NotCollectingNotice,
  PlacementBars,
  PreviewNotice,
  ProductTable,
  RevenueSummaryView,
} from "@/components/admin/conversion-ui";
import { RangeTabs } from "@/components/admin/dashboard-ui";
import { ErrorNote, PageHeader } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { parseRange, RANGES } from "@/lib/admin/stats";
import { revenueSummary, type RevenueSummary } from "@/lib/analytics/metrics";
import { funnelData, sampleFunnel, type FunnelState } from "@/lib/analytics/view";

export const metadata: Metadata = { title: "Conversion analytics" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ range?: string; preview?: string }> };

export default async function ConversionPage({ searchParams }: Props) {
  const denied = await adminGate("/admin/reports/conversion");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;

  const sp = await searchParams;
  const range = parseRange(sp.range);
  const preview = sp.preview === "1";
  const now = new Date();
  const href = (r: number, p = preview) => `/admin/reports/conversion?range=${r}${p ? "&preview=1" : ""}`;

  // Visitor funnel: no storefront events are collected yet, so there is nothing real to show. The preview is opt-in
  // sample data for reviewing the layout and is labelled on every panel.
  const funnel: FunnelState = preview ? { kind: "preview", data: sampleFunnel(range, now) } : { kind: "not-collecting" };
  const data = funnelData(funnel);
  const sample = funnel.kind === "preview";

  // Money: real website orders in the period, read-only (the same table the other reports use).
  let revenue: RevenueSummary | null = null;
  try {
    const rows = await db.webOrder.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - range * 86_400_000) } },
      select: { externalRef: true, total: true, syncStatus: true, erpStatus: true, erpPaymentStatus: true, erpStatusAt: true },
      take: 20_000,
    });
    revenue = revenueSummary(rows.map((r) => ({ ...r, total: Number(r.total) })));
  } catch {
    revenue = null;
  }

  return (
    <>
      <PageHeader
        title="Conversion analytics"
        subtitle="How visits turn into orders: the shopping funnel, product and homepage performance, and the money those orders represent."
        actions={<RangeTabs ranges={RANGES} current={range} href={(r) => href(r)} />}
      />

      {sample ? <PreviewNotice exitHref={href(range, false)} /> : <NotCollectingNotice previewHref={href(range, true)} />}

      <FunnelKpis state={funnel} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <Card icon={Funnel} title="Shopping funnel" id="funnel" sample={sample}>
          {data ? <FunnelBars data={data} /> : <NotCollectedPanel icon={Funnel} title="No funnel data yet" />}
        </Card>
        <Card icon={LineChart} title="Funnel over time" id="trend" sample={sample}>
          {data ? <FunnelTrend days={data.daily} label={`Visits, product views, adds to cart, checkouts and orders per day, last ${range} days${sample ? " (sample data)" : ""}`} /> : <NotCollectedPanel icon={LineChart} title="No daily funnel data yet" />}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card icon={Eye} title="Product performance" id="products" sample={sample}>
          {data ? <ProductTable rows={data.products} /> : <NotCollectedPanel icon={Eye} title="No product activity yet" />}
        </Card>
        <Card icon={MousePointerClick} title="Where product clicks come from" id="placements" sample={sample}>
          {data ? <PlacementBars placements={data.placements} /> : <NotCollectedPanel icon={MousePointerClick} title="No placement data yet" />}
        </Card>
      </div>

      <Card icon={Wallet} title="Orders and revenue" id="revenue" className="mt-5" aside={<span className="rounded-md bg-success-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">Real orders</span>}>
        {revenue ? <RevenueSummaryView summary={revenue} now={now} /> : <ErrorNote>Order totals could not be loaded from the website database. Reload the page to try again.</ErrorNote>}
      </Card>
    </>
  );
}
