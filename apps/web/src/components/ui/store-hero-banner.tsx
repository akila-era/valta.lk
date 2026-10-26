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
 * The page-title band at the top of storefront pages: a light full-width strip with the title, an optional lead line
 * and the breadcrumb trail, in the plain style of a retail store.
 */
export function StoreHeroBanner({ breadcrumbs, title, intro }: StoreHeroBannerProps) {
  return (
    <section className="relative -mt-8 mb-6 w-full py-6 sm:-mt-10 sm:mb-8 sm:py-8">
      {/* Full-bleed background behind the page container, flush under the header: edge to edge, no card. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 border-b border-border bg-surface" />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0 max-w-3xl">
          <h1 className="page-title">{title}</h1>
          {intro && <div className="mt-1.5 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{intro}</div>}
        </div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumbs" className="shrink-0">
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
                      <span className="font-medium text-ink">{item.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>
    </section>
  );
}
