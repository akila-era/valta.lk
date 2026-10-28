import Link from "next/link";
import { categoryIcon } from "@/components/ui/category-icon";

export interface TileItem {
  href: string;
  name: string;
  /** Number of products, shown small under the name when known. */
  count?: number;
  active?: boolean;
}

/**
 * A row of category / sub-category tiles in the style of large brand stores (ugreen.lk): a large line icon with the
 * name underneath, in fixed-width columns under the title, with no card around each one. The current one is marked in
 * orange. On phones the row scrolls sideways instead of wrapping into several rows.
 */
export function CategoryTileRow({ label, items }: { label: string; items: TileItem[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="-mx-4 mt-6 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2 sm:grid sm:w-full sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,11rem))] sm:gap-x-6 sm:gap-y-6">
        {items.map((t) => {
          const Icon = categoryIcon(t.name);
          return (
            <li key={t.href} className="w-28 shrink-0 sm:w-auto">
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`group flex h-full flex-col items-center gap-3 rounded-card px-2 py-3 text-center transition-colors ${t.active ? "text-brand-600" : "text-ink hover:text-brand-600"}`}
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0 sm:h-16 sm:w-16 ${t.active ? "bg-brand-500 text-on-brand" : "bg-surface text-ink group-hover:bg-brand-50 group-hover:text-brand-600"}`}
                >
                  <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.4} aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-snug sm:text-[15px]">{t.name}</span>
                {t.count != null ? <span className="-mt-2 text-xs font-medium text-muted">{t.count} {t.count === 1 ? "product" : "products"}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
