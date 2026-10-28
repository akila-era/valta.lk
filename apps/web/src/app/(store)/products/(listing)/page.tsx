import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import { CategoryTileRow } from "@/components/products/category-tile-row";
import { listProducts } from "@/lib/erp/catalogue";

const brandOf = (p: RawParams) => p.brand?.trim().slice(0, 80) || undefined;

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
  // The catalogue's categories as tiles; if the ERP cannot answer, the page simply shows no tiles.
  const categories = brand ? [] : await listProducts({ pageSize: 1 }).then((r) => r.categories).catch(() => []);
  return (
    <>
      {brand ? (
        <StoreHeroBanner
          breadcrumbs={[{ href: "/", label: "Home" }, { href: "/brands", label: "Brands" }, { label: brand }]}
          title={brand}
        />
      ) : (
        <StoreHeroBanner
          breadcrumbs={[{ href: "/", label: "Home" }, { label: "All products" }]}
          title="All Products"
        >
          <CategoryTileRow label="Shop by category" items={categories.map((c) => ({ href: `/categories/${c.slug}`, name: c.name, count: c.count }))} />
        </StoreHeroBanner>
      )}
      <CatalogueView basePath="/products" params={params} />
      <RecentlyViewed />
    </>
  );
}
