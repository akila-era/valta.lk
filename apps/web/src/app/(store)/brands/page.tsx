import type { Metadata } from "next";
import { BrandTile } from "@/components/brands/brand-tile";
import { Breadcrumbs } from "@/components/ui/chrome";
import { EmptyState, ErpUnavailable } from "@/components/ui/states";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import { listBrands } from "@/lib/erp/catalogue";

export const metadata: Metadata = {
  title: "Shop by brand",
  description: "Every brand in the VALTA.LK catalogue. Choose a brand to see its products.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  let brands: Awaited<ReturnType<typeof listBrands>> | null = null;
  try {
    brands = await listBrands();
  } catch {
    brands = null; // the catalogue could not be reached: show the standard retry state instead of an error page
  }
  const logos = brands ? await brandLogoMap() : new Map<string, string>();
  const sorted = (brands ?? []).map((b) => ({ ...b, logo: logos.get(brandKey(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Brands" }]} />
      <h1 className="page-title mb-2">All brands</h1>
      {brands === null ? (
        <ErpUnavailable retryHref="/brands" />
      ) : sorted.length === 0 ? (
        <EmptyState title="No brands to show yet" action={{ href: "/products", label: "Browse all products" }}>
          Brands will appear here as soon as products are available.
        </EmptyState>
      ) : (
        <>
          <p className="mb-8 max-w-xl text-sm text-muted sm:text-base">
            {sorted.length} {sorted.length === 1 ? "brand" : "brands"} in our catalogue. Choose one to see its products.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sorted.map((b) => (
              <li key={b.name}>
                <BrandTile brand={b} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
