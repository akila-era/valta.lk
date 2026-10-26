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
    <section className="relative isolate -mt-8 mb-6 w-full py-6 sm:-mt-10 sm:mb-8 sm:py-8">
      {/* Full-bleed background behind the page container, flush under the header: edge to edge, no card. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden bg-gradient-to-r from-brand-50 via-bg to-brand-100/70">
        <span className="absolute -right-24 -top-24 h-64 w-64 rounded-full border-[22px] border-brand-500/10" />
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brand-500 via-brand-400 to-brand-500 shadow-[0_0_14px_rgb(255_92_0/0.7)]" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0 max-w-3xl">
          <h1 className="page-title">{title}</h1>
          <span aria-hidden className="mt-2.5 block h-[3px] w-12 rounded-full bg-brand-500 shadow-[0_0_10px_rgb(255_92_0/0.6)]" />
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
                      <span className="font-semibold text-brand-600">{item.label}</span>
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
