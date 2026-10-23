import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Info, type LucideIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { PageSizeSelect } from "./page-size-select";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageList } from "@/lib/admin/paging";

/* Layout pieces shared by every admin page. Server components: no client JS. */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = "", id }: { title?: string; action?: { href: string; label: string }; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={`card min-w-0 p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 id={id} className="text-base font-semibold">{title}</h2>}
          {action && <Link href={action.href} className="text-sm font-semibold text-brand-600 hover:underline">{action.label} →</Link>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  orange: "bg-brand-50 text-brand-700",
  green: "bg-success-bg text-success",
  blue: "bg-surface text-ink",
  purple: "bg-brand-50 text-brand-700",
  red: "bg-danger-bg text-danger",
  grey: "bg-surface text-muted",
} as const;

/** `delta` is the % change versus the previous period; null = no earlier data to compare with. */
export function Stat({ icon: Icon, tone, label, value, sub, delta, goodWhenDown, href }: {
  icon: LucideIcon; tone: keyof typeof TONES; label: string; value: ReactNode; sub?: ReactNode; delta?: number | null; goodWhenDown?: boolean; href?: string;
}) {
  const up = (delta ?? 0) >= 0;
  const good = goodWhenDown ? !up : up;
  const body = (
    <>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}><Icon className="h-6 w-6" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="truncate text-2xl font-bold leading-tight">{value}</p>
        {delta != null && delta !== 0 ? (
          <p className={`flex items-center gap-1 text-xs font-medium ${good ? "text-success" : "text-danger"}`}>
            {up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
            {Math.abs(delta).toFixed(0)}% <span className="font-normal text-muted">vs previous period</span>
          </p>
        ) : (
          sub && <p className="text-xs text-muted">{sub}</p>
        )}
      </div>
    </>
  );
  const cls = "card flex min-w-0 items-center gap-4 p-4";
  return href ? <Link href={href} className={`${cls} hover:border-ink`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/**
 * Polished "not available yet" screen for areas the ERP or website do not support. States what the feature is for,
 * why it is unavailable and what is needed, and never pretends to work.
 */
export function NotAvailable({ title, purpose, why, needs, children }: { title: string; purpose?: string; why: string; needs?: string[]; children?: ReactNode }) {
  return (
    <div className="card overflow-hidden" role="status">
      <div className="flex items-start gap-4 border-b border-border bg-warn-bg/50 p-5 sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-bg text-warn"><Info className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-warn">Not available yet</p>
          <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
        </div>
      </div>
      <dl className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3">
        {purpose && (
          <div>
            <dt className="text-sm font-semibold">What it is for</dt>
            <dd className="mt-1 text-sm text-muted">{purpose}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-semibold">Why it is unavailable</dt>
          <dd className="mt-1 text-sm text-muted">{why}</dd>
        </div>
        {needs && needs.length > 0 && (
          <div>
            <dt className="text-sm font-semibold">What is needed</dt>
            <dd className="mt-1"><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{needs.map((n) => <li key={n}>{n}</li>)}</ul></dd>
          </div>
        )}
      </dl>
      {children && <div className="border-t border-border bg-surface/60 p-4 sm:px-6"><p className="mb-2 text-sm font-semibold">What you can do now</p><div className="flex flex-wrap gap-2">{children}</div></div>}
    </div>
  );
}

/** Label/value rows for detail screens. `mono` keeps references and tracking numbers easy to read. */
export function Facts({ rows, label }: { rows: { k: string; v: ReactNode; testId?: string }[]; label?: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-border text-sm">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-1 gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-muted">{r.k}</dt>
          <dd className="min-w-0 break-words font-medium" data-testid={r.testId}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A bar of filters above a list. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg p-3 sm:p-4">{children}</div>;
}

/** Link-based segmented control (works without JavaScript; the current choice is exposed with aria-current). */
export function Segmented({ label, options, current }: { label: string; options: { href: string; label: string; value: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <Link key={o.value} href={o.href} aria-current={o.value === current ? "true" : undefined} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${o.value === current ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-bg p-4 text-sm text-warn">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">{children}</p>;
}

/** Compact data table: horizontally scrollable on small screens. */
export function Table({ head, children, min = "40rem", label, dense }: { head: (string | { label: string; right?: boolean })[]; children: ReactNode; min?: string; label?: string; dense?: boolean }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-bg">
      <table className="w-full text-left text-sm" style={{ minWidth: min }} aria-label={label}>
        <thead className="border-b border-border bg-surface/80 text-[11px] uppercase tracking-wider text-muted">
          <tr>
            {head.map((h) => {
              const o = typeof h === "string" ? { label: h, right: false } : h;
              return <th key={o.label} scope="col" className={`${dense ? "px-3" : "px-4"} py-3 font-semibold ${o.right ? "text-right" : ""}`}>{o.label}</th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums [&_tr:hover]:bg-surface/70">{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Footer under every list: "Showing x to y of N", per-page picker and numbered pages in brand colours.
 * Pass `total` and `pageSize` for the full version; without them it falls back to Previous / Next only.
 */
export function Pager({ page, pageCount, href, total, pageSize, defaultSize = DEFAULT_PAGE_SIZE, noun = "results" }: {
  page: number; pageCount: number; href: (p: number) => string; total?: number; pageSize?: number; defaultSize?: number; noun?: string;
}) {
  const full = total !== undefined && pageSize !== undefined;
  if (!full && pageCount <= 1) return null;
  const from = full && total ? (page - 1) * pageSize + 1 : 0;
  const to = full ? Math.min(total, page * pageSize) : 0;
  const step = "inline-flex h-9 items-center rounded-lg bg-brand-50 px-3 font-semibold text-brand-700 hover:bg-brand-500 hover:text-white";
  return (
    <div className="card mt-5 flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm">
      {full ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="text-muted">Showing <b className="text-ink">{from}</b> to <b className="text-ink">{to}</b> of <b className="text-ink">{total}</b> {noun}</p>
          <Suspense fallback={null}><PageSizeSelect sizes={PAGE_SIZES} value={pageSize} defaultSize={defaultSize} /></Suspense>
        </div>
      ) : <span />}
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
          {page > 1 && <Link className={step} rel="prev" href={href(page - 1)}>Previous</Link>}
          {pageList(page, pageCount).map((n, i) =>
            n === "gap" ? <span key={`g${i}`} className="px-2 text-muted" aria-hidden>…</span> : (
              <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 font-medium ${n === page ? "border-brand-500 bg-brand-500 text-ink shadow-sm" : "border-border bg-bg hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"}`}>{n}</Link>
            ),
          )}
          {page < pageCount && <Link className={step} rel="next" href={href(page + 1)}>Next</Link>}
        </nav>
      ) : <span />}
    </div>
  );
}

/** A GET search box. */
export function SearchForm({ action, q, placeholder, hidden }: { action: string; q?: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" role="search" className="flex gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor="list-q" className="sr-only">{placeholder}</label>
      <input id="list-q" name="q" defaultValue={q} maxLength={60} placeholder={placeholder} className="input max-w-sm" />
      <button className="btn-primary" type="submit">Search</button>
      {q && <Link href={action} className="btn-secondary">Clear</Link>}
    </form>
  );
}

/* ----------------------------------------------------------------- charts (pure SVG, no client JS) */

export function BarChart({ data, format, label }: { data: { label: string; value: number }[]; format: (n: number) => string; label: string }) {
  const W = 720;
  const H = 240;
  const pad = { l: 8, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const every = Math.max(1, Math.ceil(data.length / 8));
  if (!data.some((d) => d.value > 0)) return <Empty>No sales in this period yet.</Empty>;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - f)} y2={pad.t + (H - pad.t - pad.b) * (1 - f)} stroke="var(--color-border)" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.value) / max;
          return (
            <g key={d.label + i}>
              <rect x={pad.l + i * bw + bw * 0.15} y={H - pad.b - h} width={bw * 0.7} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={2} fill="var(--color-brand-500)">
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
              {i % every === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${d.label}: ${format(d.value)}`).join(", ")}</figcaption>
    </figure>
  );
}

export const SLICE_COLORS = ["#2563eb", "#60a5fa", "#16a34a", "#f59e0b", "#7c3aed", "#94a3b8"];

export function Donut({ slices, centre, label }: { slices: { label: string; value: number }[]; centre: { big: string; small: string }; label: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" role="img" aria-label={label} className="h-40 w-40 shrink-0">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface)" strokeWidth="18" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * C;
            const el = (
              <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={SLICE_COLORS[i % SLICE_COLORS.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--color-ink)">{centre.big}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="var(--color-muted)">{centre.small}</text>
      </svg>
      <ul className="min-w-[10rem] flex-1 space-y-2 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} aria-hidden />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-semibold">{total ? Math.round((s.value / total) * 100) : 0}% <span className="font-normal text-muted">({s.value})</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
