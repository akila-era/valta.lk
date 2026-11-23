import Image from "next/image";
import Link from "next/link";
import { categoryVisual } from "@/components/home/category-art";
import { CatalogueImage } from "./catalogue-image";

interface CategoryHeaderProps {
  slug: string;
  name: string;
  count: number;
  /** A real product photo from this category in the catalogue, used when there is no studio photo for the department. */
  image?: string;
  subs: { slug: string; name: string; count: number }[];
  activeSub?: string;
}

/**
 * Category introduction: the name, how many products it holds, sub-category chips with real counts and a photograph.
 * The catalogue has no category descriptions, so none are written here.
 */
export function CategoryHeader({ slug, name, count, image, subs, activeSub }: CategoryHeaderProps) {
  const studio = categoryVisual(name);
  const chip = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors motion-reduce:transition-none";
  return (
    <header className="mb-8 overflow-hidden rounded-[1.75rem] bg-surface">
      <div className="grid items-center gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_15rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Category</p>
          <h1 className="page-title mt-2">{name}</h1>
          <p className="type-meta mt-2">{count} {count === 1 ? "product" : "products"} in this category.</p>
          {subs.length > 0 && (
            <nav aria-label={`${name} sub-categories`} className="mt-5">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link href={`/categories/${slug}`} aria-current={!activeSub ? "true" : undefined} className={`${chip} ${!activeSub ? "bg-ink text-white" : "bg-white text-ink hover:bg-border"}`}>
                    All
                  </Link>
                </li>
                {subs.map((s) => {
                  const on = s.slug === activeSub;
                  return (
                    <li key={s.slug}>
                      <Link href={`/categories/${slug}?sub=${encodeURIComponent(s.slug)}`} aria-current={on ? "true" : undefined} className={`${chip} ${on ? "bg-ink text-white" : "bg-white text-ink hover:bg-border"}`}>
                        {s.name} <span className={on ? "text-white/70" : "text-muted"}>{s.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
        {(studio || image) && (
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl bg-white md:block" aria-hidden>
            {studio ? (
              <Image src={studio} alt="" fill sizes="(min-width:1024px) 20rem, 15rem" className="object-cover" />
            ) : (
              <CatalogueImage src={image} alt="" sizes="(min-width:1024px) 20rem, 15rem" padding="p-6" />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
