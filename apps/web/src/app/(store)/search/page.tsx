import type { Metadata } from "next";
import { SearchBox } from "@/components/layout/search-box";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { Breadcrumbs } from "@/components/ui/chrome";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true }, alternates: { canonical: "/search" } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Search" }]} />
      <h1 className="page-title mb-6">{q ? `Search results for “${q.slice(0, 100)}”` : "Search"}</h1>
      <div className="mb-8 max-w-2xl">
        <SearchBox size="lg" autoFocus initialQuery={q?.slice(0, 100) ?? ""} />
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
