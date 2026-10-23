import type { Metadata } from "next";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { Breadcrumbs } from "@/components/ui/chrome";

export const metadata: Metadata = {
  title: "All products",
  description: "Browse mobile phones, electronics and accessories.",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "All products" }]} />
      <h1 className="page-title mb-6">All products</h1>
      <CatalogueView basePath="/products" params={await searchParams} />
    </>
  );
}
