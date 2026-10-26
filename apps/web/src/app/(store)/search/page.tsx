import type { Metadata } from "next";
import { SearchBox } from "@/components/layout/search-box";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { EmptyState } from "@/components/ui/states";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const q = params.q?.trim();

  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Search" }]}
        title={q ? `Results for “${q.slice(0, 50)}”` : "Search Catalogue"}
        intro={q ? `Browse products matching “${q}”.` : "Find mobile phones, headphones, chargers and accessories."}
      />

      <div className="mx-auto mb-8 max-w-2xl">
        <SearchBox size="lg" autoFocus initialQuery={q?.slice(0, 100) ?? ""} label="Search the catalogue" />
      </div>

      {q ? (
        <CatalogueView basePath="/search" params={params} />
      ) : (
        <EmptyState title="What are you looking for?" action={{ href: "/products", label: "Browse all products" }}>
          Search by product name, brand, model, category, SKU, or a barcode when the catalogue includes one.
        </EmptyState>
      )}
    </>
  );
}
