import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { ErpUnavailable } from "@/components/ui/states";
import { listProducts } from "@/lib/erp/catalogue";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import { CategoryTileRow } from "@/components/products/category-tile-row";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import type { BrandSummary } from "@/lib/erp/query";

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

  // A category without sub-categories (Mobile Phones, Tablets, Wearables...) gets its brands as tiles instead.
  let brands: BrandSummary[] = [];
  let logos = new Map<string, string>();
  if (category.subs.length === 0) {
    [brands, logos] = await Promise.all([
      listProducts({ category: slug, pageSize: 1 }).then((r) => r.brands).catch(() => [] as BrandSummary[]),
      brandLogoMap(),
    ]);
    brands = [...brands].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  const brand = brands.find((b) => brandKey(b.name) === brandKey(query.brand ?? ""));

  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "All products" },
          sub || brand ? { href: `/categories/${slug}`, label: category.name } : { label: category.name },
          ...(sub ? [{ label: sub.name }] : []),
          ...(brand ? [{ label: brand.name }] : []),
        ]}
        title={category.name}
      >
        {/* With sub-categories: those (plus "All"). Without: the category's brands (plus "All"), with their logos when staff uploaded them. */}
        {category.subs.length > 0 ? (
          <CategoryTileRow
            label={`${category.name} sub-categories`}
            items={[
              { href: `/categories/${slug}`, name: `All ${category.name}`, count: category.count, active: !sub },
              ...category.subs.map((s) => ({ href: `/categories/${slug}?sub=${s.slug}`, name: s.name, count: s.count, active: sub?.slug === s.slug })),
            ]}
          />
        ) : (
          <CategoryTileRow
            label={`${category.name} brands`}
            items={
              brands.length === 0
                ? []
                : [
                    { href: `/categories/${slug}`, name: `All ${category.name}`, count: category.count, active: !brand },
                    ...brands.map((b) => ({
                      href: `/categories/${slug}?brand=${encodeURIComponent(b.name)}`,
                      name: b.name,
                      count: b.count,
                      active: brand?.name === b.name,
                      brand: { logo: logos.get(brandKey(b.name)) },
                    })),
                  ]
            }
          />
        )}
      </StoreHeroBanner>
      <CatalogueView basePath={`/categories/${slug}`} params={query} fixedCategory={slug} />
      <RecentlyViewed />
    </>
  );
}
