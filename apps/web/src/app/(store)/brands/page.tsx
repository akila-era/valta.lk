import type { Metadata } from "next";
import { BrandGrid } from "@/components/home/storefront";
import { EmptyState, ErpUnavailable } from "@/components/ui/states";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import { listBrands } from "@/lib/erp/catalogue";

export const metadata: Metadata = {
  title: "Shop by brand",
  description: "Every brand in the VOLTA.LK catalogue. Choose a brand to see its products.",
  alternates: { canonical: "/brands" },
};

/** Every brand in the live catalogue, with its logo when staff have uploaded one, linking to that brand's products. */
export default async function BrandsPage() {
  const [brands, logos] = await Promise.all([listBrands().catch(() => null), brandLogoMap()]);
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Brands" }]}
        title="Shop by Brand"
        intro={brands ? `${brands.length} ${brands.length === 1 ? "brand" : "brands"} in our catalogue. Choose one to see its products.` : undefined}
      />
      {brands === null ? (
        <ErpUnavailable retryHref="/brands" />
      ) : brands.length === 0 ? (
        <EmptyState title="No brands yet" action={{ href: "/products", label: "Browse all products" }}>Brands will appear here once products are available.</EmptyState>
      ) : (
        <BrandGrid brands={brands.map((b) => ({ ...b, logo: logos.get(brandKey(b.name)) }))} />
      )}
    </>
  );
}
