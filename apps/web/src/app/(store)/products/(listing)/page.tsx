import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = {
  title: "All products",
  description: "Browse mobile phones, electronics and accessories.",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "All products" }]}
        title="All Products"
        intro="Explore our complete catalogue of mobile phones, electronics and tech accessories."
      />
      <CatalogueView basePath="/products" params={await searchParams} />
    </>
  );
}
