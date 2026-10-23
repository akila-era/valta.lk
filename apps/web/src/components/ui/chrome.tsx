import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function SectionHeader({ id, title, action, children, center = false }: { id?: string; title: string; action?: { href: string; label: string }; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`mb-5 flex flex-wrap items-end gap-4 ${center ? "justify-center text-center" : "justify-between"}`}>
      <div className="min-w-0">
        <h2 id={id} className="section-title">{title}</h2>
        {children ? <div className={`type-meta mt-2 max-w-2xl ${center ? "mx-auto" : ""}`}>{children}</div> : null}
      </div>
      {action ? (
        <Link href={action.href} className="shrink-0 text-sm font-semibold text-brand-600 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Divider() {
  return <hr className="border-border" />;
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} aria-current={last ? "page" : undefined} className={`flex items-center gap-1.5 ${last ? "min-w-0 max-w-full font-medium text-ink" : ""}`}>
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/70" aria-hidden /> : null}
              {item.href && !last ? <Link href={item.href} className="rounded-sm hover:text-ink hover:underline">{item.label}</Link> : <span className="truncate">{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Page numbers to show: always the first and last, two either side of the current one, and gaps as null. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/** Previous / next pager, with numbered pages when `pageHref` is given. Pass null when a direction is unavailable. */
export function Pagination({ page, pageCount, prevHref, nextHref, pageHref }: { page: number; pageCount: number; prevHref?: string | null; nextHref?: string | null; pageHref?: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const step = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors";
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-col items-center gap-3 text-sm">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {prevHref ? (
          <Link className={`${step} border-border bg-bg text-ink hover:border-ink`} rel="prev" href={prevHref}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Previous</span>
          </Link>
        ) : null}
        {pageHref ? (
          <ul className="flex items-center gap-1.5">
            {pageWindow(page, pageCount).map((p, i) =>
              p === null ? (
                <li key={`gap-${i}`} aria-hidden className="px-1 text-muted">…</li>
              ) : (
                <li key={p}>
                  <Link
                    href={pageHref(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={`${step} tabular-nums ${p === page ? "border-ink bg-ink text-white" : "border-border bg-bg text-ink hover:border-ink"}`}
                  >
                    {p}
                  </Link>
                </li>
              ),
            )}
          </ul>
        ) : null}
        {nextHref ? (
          <Link className={`${step} border-border bg-bg text-ink hover:border-ink`} rel="next" href={nextHref}>
            <span className="sr-only sm:not-sr-only">Next</span> <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <span className="text-xs text-muted">Page {page} of {pageCount}</span>
    </nav>
  );
}

export function Tabs({ label, tabs }: { label: string; tabs: { href: string; label: string; current?: boolean }[] }) {
  return (
    <nav aria-label={label} className="mb-6 max-w-full overflow-x-auto">
      <ul className="flex w-max gap-2">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link href={tab.href} aria-current={tab.current ? "page" : undefined} className={tab.current ? "btn-primary" : "btn-secondary"}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
