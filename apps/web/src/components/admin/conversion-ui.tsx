import Link from "next/link";
import { ArrowDown, Banknote, Eye, FlaskConical, Funnel, Info, MousePointerClick, PackageCheck, Percent, ShoppingCart, Users, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyPanel, Kpi } from "./dashboard-ui";
import { Table } from "./ui";
import type { RevenueSummary } from "@/lib/analytics/metrics";
import { funnelData, funnelSteps, percent, shortDay, type FunnelData, type FunnelDay, type FunnelState, type ProductRow } from "@/lib/analytics/view";
import { formatLkr } from "@/lib/utils/money";

/* Conversion Analytics building blocks (server components, pure SVG, no client JS). Everything renders from the
   presentation model in lib/analytics/view.ts. Sample (preview) data is always marked; money is never sampled. */

const n = (v: number) => v.toLocaleString("en-LK");

/** Chip on every panel that shows layout-preview numbers. */
export function SampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn">
      <FlaskConical className="h-3 w-3" aria-hidden />Sample data
    </span>
  );
}

/** Card with an icon heading, like the dashboard's sections, plus the sample chip when showing the preview. */
export function Card({ icon: Icon, title, id, sample, aside, children, className = "" }: {
  icon: LucideIcon; title: string; id: string; sample?: boolean; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight"><Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />{title}</h2>
        <div className="flex items-center gap-2">{sample && <SampleBadge />}{aside}</div>
      </div>
      {children}
    </section>
  );
}

/** Shown at the top while no funnel events exist: what the page will show and why it is empty, with the preview link. */
export function NotCollectingNotice({ previewHref }: { previewHref: string }) {
  return (
    <div role="status" className="card mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info-bg text-info"><Info className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">Visitor tracking is not switched on yet</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Visits, product views, add-to-cart and checkout steps will appear here once the storefront starts recording anonymous shopping events.
          Nothing is recorded today, so these panels are empty rather than estimated. Order value and cash collected below are real: they come from orders saved on the website.
        </p>
      </div>
      <Link href={previewHref} className="btn-secondary shrink-0 self-start">Preview the layout</Link>
    </div>
  );
}

/** Banner above the page while the layout preview is on. */
export function PreviewNotice({ exitHref }: { exitHref: string }) {
  return (
    <div role="note" className="mb-5 flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn-bg p-4 text-sm text-warn sm:flex-row sm:items-center">
      <FlaskConical className="h-5 w-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <b>Layout preview, sample data.</b> The visitor and product numbers on this page are made up to show the layout and are not your shop&apos;s figures.
        Order value and cash collected stay real.
      </p>
      <Link href={exitHref} className="btn-secondary shrink-0 self-start bg-bg sm:self-auto">Exit preview</Link>
    </div>
  );
}

/** The six headline numbers. Without data each card says so instead of showing 0. */
export function FunnelKpis({ state }: { state: FunnelState }) {
  const d = funnelData(state);
  const sub = (live: string) => (d ? (state.kind === "preview" ? "sample data" : live) : "not collected yet");
  const steps = d ? funnelSteps(d) : null;
  const cards: { icon: LucideIcon; tone: "orange" | "green" | "blue" | "purple"; label: string; value: string; sub: string }[] = [
    { icon: Users, tone: "blue", label: "Visits", value: d ? n(d.visits) : "—", sub: sub("browser tabs that sent any event") },
    { icon: Eye, tone: "blue", label: "Product views", value: d ? n(d.productViews) : "—", sub: sub(`${percent(steps?.[1].ofVisits ?? null)} of visits`) },
    { icon: ShoppingCart, tone: "orange", label: "Add to cart", value: d ? n(d.addToCart) : "—", sub: sub(`${percent(steps?.[2].ofVisits ?? null)} of visits`) },
    { icon: Wallet, tone: "purple", label: "Checkout starts", value: d ? n(d.checkoutStarts) : "—", sub: sub(`${percent(steps?.[3].ofVisits ?? null)} of visits`) },
    { icon: PackageCheck, tone: "green", label: "Completed orders", value: d ? n(d.orders) : "—", sub: sub("visits with a confirmed website order") },
    { icon: Percent, tone: "orange", label: "Conversion rate", value: d ? percent(steps?.[4].ofVisits ?? null) : "—", sub: sub("orders ÷ visits") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map((c) => <Kpi key={c.label} {...c} />)}
    </div>
  );
}

/** Visits → Product views → Add to cart → Checkout → Orders as shrinking bars, with the share that continued. */
export function FunnelBars({ data }: { data: FunnelData }) {
  const steps = funnelSteps(data);
  const max = Math.max(1, steps[0].value);
  return (
    <ol className="space-y-1" aria-label="Shopping funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          {i > 0 && (
            <p className="flex items-center gap-1.5 py-1 pl-1 text-xs text-muted">
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              <span><b className="font-semibold text-ink">{percent(s.fromPrevious)}</b> continued from {steps[i - 1].label.toLowerCase()}</span>
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_7rem] sm:items-center">
            <span className="text-sm font-medium">{s.label}</span>
            <span className="text-right text-sm font-semibold tabular-nums sm:order-last">{n(s.value)} <span className="text-xs font-normal text-muted">{i === 0 ? "" : percent(s.ofVisits)}</span></span>
            <span className="col-span-2 mt-1 block h-7 overflow-hidden rounded-lg bg-surface sm:col-span-1 sm:mt-0" aria-hidden>
              <span className="block h-full rounded-lg bg-brand-500" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / max) * 100)}%`, opacity: 1 - i * 0.14 }} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const SERIES: { key: keyof Omit<FunnelDay, "day">; label: string; color: string }[] = [
  { key: "visits", label: "Visits", color: "#94a3b8" },
  { key: "views", label: "Product views", color: "#0ea5e9" },
  { key: "adds", label: "Add to cart", color: "#ff5c00" },
  { key: "checkouts", label: "Checkout", color: "#7c3aed" },
  { key: "orders", label: "Orders", color: "#067647" },
];

/** Funnel steps per day as lines. The same numbers are available as a table below the chart. */
export function FunnelTrend({ days, label }: { days: FunnelDay[]; label: string }) {
  if (!days.some((d) => d.visits > 0)) return <EmptyPanel icon={Funnel} title="No visits recorded in this period" />;
  const W = 720;
  const H = 260;
  const pad = { l: 36, r: 10, t: 12, b: 28 };
  const max = Math.max(1, ...days.flatMap((d) => SERIES.map((s) => d[s.key])));
  const x = (i: number) => pad.l + (days.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (days.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const every = Math.max(1, Math.ceil(days.length / 8));
  // Label every `every`-th day, plus the last day unless it would sit on top of the previous label.
  const labelled = (i: number) => i % every === 0 || (i === days.length - 1 && i % every >= every / 2);
  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: s.color }} aria-hidden />{s.label}</li>
        ))}
      </ul>
      {/* Phones: the chart keeps a readable minimum width and scrolls sideways inside its card. */}
      <div className="-mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full min-w-[34rem]">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-border)" strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">{Math.round(max * f)}</text>
          </g>
        ))}
        {SERIES.map((s) => (
          <path key={s.key} d={days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[s.key]).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.key === "orders" || s.key === "adds" ? 2.4 : 1.6} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {days.map((d, i) => labelled(i) && (
          <text key={d.day} x={x(i)} y={H - 8} textAnchor={i === days.length - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="11" fill="var(--color-muted)">{shortDay(d.day)}</text>
        ))}
      </svg>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-600 hover:underline">Show as a table</summary>
        <div className="mt-3">
          <Table label="Funnel per day" min="34rem" dense head={["Day", ...SERIES.map((s) => ({ label: s.label, right: true }))]}>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <td className="px-3 py-2">{shortDay(d.day)}</td>
                {SERIES.map((s) => <td key={s.key} className="px-3 py-2 text-right">{n(d[s.key])}</td>)}
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </figure>
  );
}

/** Product performance by distinct visits, with the add-to-cart rate as a small bar. */
export function ProductTable({ rows }: { rows: ProductRow[] }) {
  if (!rows.length) return <EmptyPanel icon={Eye} title="No product activity in this period" />;
  return (
    <Table label="Product performance" min="36rem" head={["Product", { label: "Views", right: true }, { label: "Clicks", right: true }, { label: "Add to cart", right: true }, { label: "Add-to-cart rate", right: true }]}>
      {rows.map((r) => (
        <tr key={r.name}>
          <td className="max-w-[16rem] truncate px-4 py-3 font-medium">{r.name}</td>
          <td className="px-4 py-3 text-right">{n(r.views)}</td>
          <td className="px-4 py-3 text-right">{n(r.clicks)}</td>
          <td className="px-4 py-3 text-right">{n(r.adds)}</td>
          <td className="px-4 py-3">
            <span className="flex items-center justify-end gap-2">
              <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface sm:block" aria-hidden>
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (r.addRate ?? 0) * 100)}%` }} />
              </span>
              <span className="w-12 text-right font-semibold">{percent(r.addRate)}</span>
            </span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

/** Product clicks per homepage section and discovery surface, as horizontal bars with their share. */
export function PlacementBars({ placements }: { placements: FunnelData["placements"] }) {
  const total = placements.reduce((a, p) => a + p.clicks, 0);
  if (total === 0) return <EmptyPanel icon={MousePointerClick} title="No product clicks recorded in this period" />;
  const max = Math.max(1, ...placements.map((p) => p.clicks));
  return (
    <ul className="space-y-3" aria-label="Product clicks by placement">
      {placements.map((p) => (
        <li key={p.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{p.label}</span>
            <span className="tabular-nums"><b>{n(p.clicks)}</b> <span className="text-xs text-muted">{percent(p.clicks / total, 0)}</span></span>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(p.clicks / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const ago = (d: Date, now: Date) => {
  const m = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * Real money from website orders. Placed order value (what customers ordered) and COD collected (cash the ERP has
 * recorded) are shown side by side and never added together.
 */
export function RevenueSummaryView({ summary, now }: { summary: RevenueSummary; now: Date }) {
  const fresh = summary.oldestStatusAt;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface/60 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted"><ShoppingCart className="h-4 w-4 text-brand-600" aria-hidden />Placed order value</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatLkr(summary.placedValue)}</p>
          <p className="mt-1 text-xs text-muted">{n(summary.orders)} {summary.orders === 1 ? "order" : "orders"} placed, not cancelled. This is order value, not cash received.</p>
        </div>
        <div className="rounded-xl border border-success/25 bg-success-bg/60 p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-success"><Banknote className="h-4 w-4" aria-hidden />COD collected</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatLkr(summary.collectedValue)}</p>
          <p className="mt-1 text-xs text-muted">{n(summary.collectedOrders)} {summary.collectedOrders === 1 ? "order" : "orders"} the ERP has marked as cash collected.</p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-border text-sm">
        <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Still to collect</dt><dd className="font-semibold tabular-nums">{formatLkr(summary.outstandingValue)}</dd></div>
        <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Cancelled orders (no value)</dt><dd className="font-semibold tabular-nums">{n(summary.cancelledOrders)}</dd></div>
        <div className="flex justify-between gap-3 py-2.5">
          <dt className="text-muted">Orders that never reached the ERP</dt>
          <dd className="font-semibold tabular-nums">{summary.failedOrders > 0 ? <Link href="/admin/erp/failed" className="text-danger hover:underline">{n(summary.failedOrders)} need attention</Link> : "0"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Statuses and cash collection are the website&apos;s copy of the ERP, refreshed when an order is opened.
        {fresh ? (fresh.getTime() === 0 ? " Some in-progress orders have not been checked since they were placed." : ` The oldest in-progress status was last checked ${ago(fresh, now)}.`) : " Every order in this period is finished."}{" "}
        <Link href="/admin/orders" className="font-semibold text-brand-600 hover:underline">Open orders</Link>
      </p>
    </div>
  );
}

/** Placeholder body for a funnel panel while nothing is collected. */
export function NotCollectedPanel({ icon, title }: { icon: LucideIcon; title: string }) {
  return <EmptyPanel icon={icon} title={title}>Appears once visitor tracking is switched on.</EmptyPanel>;
}
