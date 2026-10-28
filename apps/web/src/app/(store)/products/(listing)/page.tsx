import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { RecentlyViewed } from "@/components/products/recently-viewed";

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
  return (
    <>
      {brand ? (
        <StoreHeroBanner
          breadcrumbs={[{ href: "/", label: "Home" }, { href: "/brands", label: "Brands" }, { label: brand }]}
          title={brand}
          intro={`Shop ${brand} products. Use the filters to narrow by category or price.`}
        />
      ) : (
        <StoreHeroBanner
          breadcrumbs={[{ href: "/", label: "Home" }, { label: "All products" }]}
          title="All Products"
          intro="Explore our complete catalogue of mobile phones, electronics and tech accessories."
        />
      )}
      <CatalogueView basePath="/products" params={params} />
      <RecentlyViewed />
    </>
  );
}
