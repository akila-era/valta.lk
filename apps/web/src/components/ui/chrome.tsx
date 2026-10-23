import Link from "next/link";
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
      <ol className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} aria-current={last ? "page" : undefined}>
              {i > 0 ? <span aria-hidden>/ </span> : null}
              {item.href && !last ? <Link href={item.href} className="hover:text-ink">{item.label}</Link> : item.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Previous / next pager. Pass null when that direction is unavailable. */
export function Pagination({ page, pageCount, prevHref, nextHref }: { page: number; pageCount: number; prevHref?: string | null; nextHref?: string | null }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3 text-sm">
      {prevHref ? <Link className="btn-secondary" rel="prev" href={prevHref}>Previous</Link> : <span />}
      <span className="text-muted">Page {page} of {pageCount}</span>
      {nextHref ? <Link className="btn-secondary" rel="next" href={nextHref}>Next</Link> : <span />}
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
