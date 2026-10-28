import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface BreadcrumbItem {
  href?: string;
  label: string;
}

interface StoreHeroBannerProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  intro?: ReactNode;
}

/**
 * The page heading at the top of storefront pages, in the clean style of large brand stores: the breadcrumb trail,
 * the title with a short orange bar, an optional lead line, and a hairline underneath.
 */
export function StoreHeroBanner({ breadcrumbs, title, intro }: StoreHeroBannerProps) {
  return (
    <section className="mb-6 w-full border-b border-border pb-5 sm:mb-8 sm:pb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumbs" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
            {breadcrumbs.map((item, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted/60" aria-hidden />}
                  {item.href && !isLast ? (
                    <Link href={item.href} className="inline-flex min-h-6 items-center hover:text-brand-600">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink">{item.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <h1 className="page-title">{title}</h1>
      <span aria-hidden className="mt-2.5 block h-[3px] w-12 rounded-full bg-brand-500" />
      {intro && <div className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{intro}</div>}
    </section>
  );
}
