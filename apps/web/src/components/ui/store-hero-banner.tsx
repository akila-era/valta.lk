import Link from "next/link";
import type { ReactNode } from "react";

interface BreadcrumbItem {
  href?: string;
  label: string;
}

interface StoreHeroBannerProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  intro?: ReactNode;
  /** Shown under the breadcrumb, inside the hairline: used for the category / sub-category tile row. */
  children?: ReactNode;
}

/**
 * The page heading at the top of storefront pages, in the clean style of large brand stores (ugreen.lk): a large bold
 * title, the breadcrumb trail under it ("Home / Power Banks"), an optional lead line, then whatever the page puts in
 * (e.g. category tiles), all closed off by a hairline.
 */
export function StoreHeroBanner({ breadcrumbs, title, intro, children }: StoreHeroBannerProps) {
  return (
    <section className="mb-6 w-full border-b border-border pb-5 sm:mb-8 sm:pb-6">
      <h1 className="page-title mt-1 sm:mt-3">{title}</h1>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumbs" className="mt-3 sm:mt-5">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted sm:text-[15px]">
            {breadcrumbs.map((item, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={`${item.label}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="text-muted/60">
                      /
                    </span>
                  )}
                  {item.href && !isLast ? (
                    <Link href={item.href} className="inline-flex min-h-6 items-center hover:text-brand-600">
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current={isLast ? "page" : undefined} className="font-semibold text-ink">
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {intro && <div className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{intro}</div>}
      {children}
    </section>
  );
}
