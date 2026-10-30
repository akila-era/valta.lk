import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* Dashboard building blocks (server components, no client JS). */

const TONES = {
  orange: { box: "bg-brand-500 text-white", stroke: "#ff5c00", glow: "from-brand-500/10" },
  green: { box: "bg-success-bg text-success", stroke: "#067647", glow: "from-success/10" },
  blue: { box: "bg-ink text-white", stroke: "#111111", glow: "from-ink/5" },
  purple: { box: "bg-ink text-brand-500", stroke: "#ff5c00", glow: "from-brand-500/10" },
  red: { box: "bg-danger-bg text-danger", stroke: "#b42318", glow: "from-danger/10" },
} as const;
export type DashTone = keyof typeof TONES;

/** Real data only: a tiny trend line from the daily values behind the number (flat at the bottom when they are all zero). */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null; // nothing to show yet: no line
  const W = 120;
  const H = 32;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="pointer-events-none absolute bottom-0 right-0 h-9 w-[55%]">
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={color} opacity="0.1" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** KPI card. `trend` (daily values) draws a real sparkline; without it only a soft tinted base is shown. */
export function Kpi({ icon: Icon, tone, label, value, sub, delta, href, trend, trendLabel }: {
  icon: LucideIcon; tone: DashTone; label: string; value: ReactNode; sub?: ReactNode; delta?: number | null; href?: string; trend?: number[]; trendLabel?: string;
}) {
  const t = TONES[tone];
  const up = (delta ?? 0) >= 0;
  const body = (
    <>
      {trend && <Sparkline values={trend} color={t.stroke} label={trendLabel ?? `${label} trend`} />}
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[13px] font-medium leading-tight text-muted">{label}</p>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.box}`}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
        </div>
        <p className="mt-1 truncate font-display text-xl font-extrabold leading-tight tracking-title tabular-nums sm:text-[1.65rem]">{value}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {delta != null && delta !== 0 && (
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${up ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
              {up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}{Math.abs(delta).toFixed(0)}%
              <span className="sr-only"> vs previous period</span>
            </span>
          )}
          {sub && <span className="text-muted">{sub}</span>}
        </div>
        {trend && <div className="h-6" aria-hidden />}
      </div>
    </>
  );
  const cls = "card relative block min-w-0 overflow-hidden p-4 transition-[border-color,box-shadow] motion-reduce:transition-none";
  return href ? <Link href={href} className={`${cls} hover:border-brand-500 hover:shadow-lift`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Card with an icon heading, an optional orange action link and an optional (read-only) period chip. */
export function Section({ icon: Icon, title, id, action, period, children, className = "" }: {
  icon: LucideIcon; title: string; id: string; action?: { href: string; label: string }; period?: string; children: ReactNode; className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id} className="flex min-w-0 items-center gap-2 font-display text-base font-extrabold tracking-title"><Icon className="h-[18px] w-[18px] shrink-0 text-brand-500" aria-hidden />{title}</h2>
        {period && <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{period}</span>}
        {action && <Link href={action.href} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-600 hover:underline">{action.label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
      </div>
      {children}
    </section>
  );
}

/** Friendly empty state: round icon, headline and one explanatory line, in a dashed box. */
export function EmptyPanel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-5 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted"><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="mt-2.5 text-sm font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-xs text-xs text-muted">{children}</p>}
    </div>
  );
}

/** Date-range switch: blue pill for the current range. */
export function RangeTabs({ ranges, current, href }: { ranges: readonly number[]; current: number; href: (r: number) => string }) {
  return (
    <nav aria-label="Date range" className="flex max-w-full flex-wrap rounded-control border border-border bg-bg p-1 text-sm shadow-card">
      {ranges.map((r) => (
        <Link key={r} href={href(r)} aria-current={r === current ? "true" : undefined} className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none sm:px-4 ${r === current ? "bg-brand-500 text-on-brand" : "text-muted hover:text-ink"}`}>
          Last {r} days
        </Link>
      ))}
    </nav>
  );
}

export interface AttentionItem { label: string; count: number; href: string; tone: "red" | "amber" | "blue" }

/** Actionable signals first: what needs a person today, each linking to the list that fixes it. */
export function Attention({ items }: { items: AttentionItem[] }) {
  const open = items.filter((i) => i.count > 0);
  const TONE = { red: "bg-danger-bg text-danger", amber: "bg-warn-bg text-warn", blue: "bg-info-bg text-info" } as const;
  return (
    <section aria-label="Needs attention" className="card mb-5 flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 sm:px-5">
      <h2 className="font-display text-sm font-extrabold">Needs attention</h2>
      {open.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success"><span className="h-2 w-2 rounded-full bg-success" aria-hidden />Nothing needs attention right now.</p>
      ) : (
        <ul className="flex flex-wrap items-center gap-2">
          {open.map((i) => (
            <li key={i.label}>
              <Link href={i.href} className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:brightness-95 ${TONE[i.tone]}`}>
                <span className="font-bold tabular-nums">{i.count}</span>{i.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
