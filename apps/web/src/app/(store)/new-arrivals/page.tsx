import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { RecentlyViewed } from "@/components/products/recently-viewed";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = { title: "New arrivals", alternates: { canonical: "/new-arrivals" } };

/** New Arrivals (as on ugreen.lk): only recently published products, with the usual filters, sorting and paging. */
export default async function NewArrivalsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  return (
    <>
      <StoreHeroBanner breadcrumbs={[{ href: "/", label: "Home" }, { label: "New arrivals" }]} title="New Arrivals" />
      <CatalogueView basePath="/new-arrivals" params={params} fresh />
      <RecentlyViewed />
    </>
  );
}
