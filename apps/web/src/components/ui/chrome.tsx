import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** "View all" style link: ink text with an arrow that slides on hover. */
export function ArrowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`group/al inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 ${className}`}>
      <span className="underline decoration-transparent underline-offset-4 transition-colors group-hover/al:decoration-current">{children}</span>
      <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-hover/al:translate-x-0.5" />
    </Link>
  );
}

export function SectionHeader({ id, title, eyebrow, action, children, center = false }: { id?: string; title: string; eyebrow?: string; action?: { href: string; label: string }; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 sm:mb-6 ${center ? "justify-center text-center" : "justify-between"}`}>
      {/* The small label (with its neon signal dot) sits above the title; a short description may follow. */}
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 id={id} className="section-title">{title}</h2>
        {children ? <div className={`mt-1 max-w-2xl text-sm text-muted ${center ? "mx-auto" : ""}`}>{children}</div> : null}
      </div>
      {action ? <ArrowLink href={action.href}>{action.label}</ArrowLink> : null}
    </div>
  );
}

export function Divider() {
  return <hr className="border-border" />;
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 w-fit max-w-full rounded-2xl bg-white/75 px-4 py-2 text-sm text-muted shadow-soft ring-1 ring-ink/[0.06] backdrop-blur">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} aria-current={last ? "page" : undefined} className={`flex items-center gap-1.5 ${last ? "min-w-0 max-w-full font-medium text-ink" : ""}`}>
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/70" aria-hidden /> : null}
              {item.href && !last ? <Link href={item.href} className="inline-flex min-h-6 items-center rounded-sm hover:text-ink hover:underline">{item.label}</Link> : <span className="truncate">{item.label}</span>}
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
                    className={`${step} tabular-nums ${p === page ? "border-ink bg-ink text-bg" : "border-border bg-bg text-ink hover:border-ink"}`}
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
