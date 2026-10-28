import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { ErpUnavailable } from "@/components/ui/states";
import { listProducts } from "@/lib/erp/catalogue";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import { CategoryTileRow } from "@/components/products/category-tile-row";

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
  let allCategories: Awaited<ReturnType<typeof listProducts>>["categories"] = [];
  try {
    allCategories = (await listProducts({ pageSize: 1 })).categories;
    category = allCategories.find((c) => c.slug === slug) ?? null;
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
      >
        {/* With sub-categories: those (plus "All"). Without: the main categories, this one highlighted, so every category page has the same tile row. */}
        {category.subs.length > 0 ? (
          <CategoryTileRow
            label={`${category.name} sub-categories`}
            items={[
              { href: `/categories/${slug}`, name: `All ${category.name}`, count: category.count, active: !sub },
              ...category.subs.map((s) => ({ href: `/categories/${slug}?sub=${s.slug}`, name: s.name, count: s.count, active: sub?.slug === s.slug })),
            ]}
          />
        ) : (
          <CategoryTileRow label="Shop by category" items={allCategories.map((c) => ({ href: `/categories/${c.slug}`, name: c.name, count: c.count, active: c.slug === slug }))} />
        )}
      </StoreHeroBanner>
      <CatalogueView basePath={`/categories/${slug}`} params={query} fixedCategory={slug} />
      <RecentlyViewed />
    </>
  );
}
