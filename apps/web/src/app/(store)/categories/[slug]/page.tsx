import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { ErpUnavailable } from "@/components/ui/states";
import { listProducts } from "@/lib/erp/catalogue";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import Link from "next/link";
import { categoryIcon } from "@/components/ui/category-icon";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

async function findCategory(slug: string) {
  const { categories } = await listProducts({ pageSize: 1 });
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await findCategory(slug);
    if (!c) return { title: "Category not found", robots: { index: false } };
    return { title: c.name, description: `Shop ${c.name} at VOLTA.LK.`, alternates: { canonical: `/categories/${slug}` } };
  } catch {
    return { title: "Category" };
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  let category;
  try {
    category = await findCategory(slug);
  } catch {
    return <ErpUnavailable retryHref={`/categories/${slug}`} />;
  }
  if (!category) notFound();
  const query = await searchParams;
  const sub = category.subs.find((s) => s.slug === query.sub);

  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "All products" },
          sub ? { href: `/categories/${slug}`, label: category.name } : { label: category.name },
          ...(sub ? [{ label: sub.name }] : []),
        ]}
        title={category.name}
        intro={`${category.count} ${category.count === 1 ? "product" : "products"} in this category.`}
      />
      {category.subs.length > 0 && (
        // Sub-category tiles, as large stores show above a category's products.
        <nav aria-label={`${category.name} sub-categories`} className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-2.5 sm:w-auto sm:flex-wrap">
            {[{ slug: "", name: `All ${category.name}`, count: category.count }, ...category.subs].map((s) => {
              const on = (sub?.slug ?? "") === s.slug;
              const Icon = categoryIcon(s.name || category.name);
              return (
                <li key={s.slug || "all"}>
                  <Link
                    href={s.slug ? `/categories/${slug}?sub=${s.slug}` : `/categories/${slug}`}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-2.5 rounded-card border px-3.5 py-2 text-sm font-semibold transition-[border-color,background-color,box-shadow] ${on ? "border-ink bg-ink text-white" : "border-border bg-bg text-ink hover:border-brand-500 hover:shadow-neon"}`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${on ? "bg-brand-500 text-on-brand" : "bg-brand-50 text-brand-600"}`}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    {s.name}
                    <span className={`text-xs font-medium ${on ? "text-white/70" : "text-muted"}`}>{s.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <CatalogueView basePath={`/categories/${slug}`} params={query} fixedCategory={slug} />
      <RecentlyViewed />
    </>
  );
}
