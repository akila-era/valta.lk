import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import { CategoryTileRow } from "@/components/products/category-tile-row";
import { BrandHero, type BrandCategory } from "@/components/products/brand-hero";
import { brandColor, brandThemeStyle } from "@/lib/brand-colors";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import { listBrands, listProducts } from "@/lib/erp/catalogue";

const brandOf = (p: RawParams) => p.brand?.trim().slice(0, 80) || undefined;

/** The categories one brand has products in, with counts (for the chips at the top of its page). Empty if the ERP cannot answer. */
async function brandCategories(brand: string): Promise<BrandCategory[]> {
  const counts = new Map<string, BrandCategory>();
  try {
    for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
      const r = await listProducts({ brand, pageSize: 48, page });
      pages = r.pageCount;
      for (const p of r.items) {
        if (!p.category) continue;
        const c = counts.get(p.category.slug) ?? { slug: p.category.slug, name: p.category.name, count: 0 };
        c.count++;
        counts.set(c.slug, c);
      }
    }
  } catch {
    return [];
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<RawParams> }): Promise<Metadata> {
  const brand = brandOf(await searchParams);
  return brand
    ? { title: `${brand} products`, description: `Shop ${brand} products at VOLTA.LK.`, alternates: { canonical: `/products?brand=${encodeURIComponent(brand)}` } }
    : { title: "All products", description: "Browse mobile phones, electronics and accessories.", alternates: { canonical: "/products" } };
}

/** The catalogue. With a brand chosen (?brand=, from Shop by Brand) the page becomes that brand's shop. */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const brand = brandOf(params);
  if (brand) {
    // A brand's page is shown in the brand's own colour (Admin, Brands): the band at the top, and the buttons, prices and
    // badges of the products below. The header and footer keep the store's colours.
    const [color, logos, brands, categories] = await Promise.all([brandColor(brand), brandLogoMap(), listBrands().catch(() => []), brandCategories(brand)]);
    const known = brands.find((b) => brandKey(b.name) === brandKey(brand));
    return (
      <div style={brandThemeStyle(color) as React.CSSProperties}>
        <BrandHero name={known?.name ?? brand} color={color} logo={logos.get(brandKey(brand))} count={known?.count} categories={categories} current={params.category} />
        <div id="brand-products" className="scroll-mt-40">
          <CatalogueView basePath="/products" params={params} />
        </div>
        <RecentlyViewed />
      </div>
    );
  }
  // The catalogue's categories as tiles; if the ERP cannot answer, the page simply shows no tiles.
  const categories = await listProducts({ pageSize: 1 }).then((r) => r.categories).catch(() => []);
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "All products" }]}
        title="All Products"
      >
        <CategoryTileRow label="Shop by category" items={categories.map((c) => ({ href: `/categories/${c.slug}`, name: c.name, count: c.count }))} />
      </StoreHeroBanner>
      <CatalogueView basePath="/products" params={params} />
      <RecentlyViewed />
    </>
  );
}
