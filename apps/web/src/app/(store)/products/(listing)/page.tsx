import type { Metadata } from "next";
import { BrandHeader } from "@/components/brands/brand-header";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { Breadcrumbs } from "@/components/ui/chrome";
import { brandKey, brandLogoMap } from "@/lib/brand-logos";
import { listBrands } from "@/lib/erp/catalogue";

type Props = { searchParams: Promise<RawParams> };

/** The catalogue brand the `brand` filter names (matched case-insensitively), or null when there is none or the catalogue is unreachable. */
async function findBrand(raw?: string) {
  const wanted = raw?.trim().toLowerCase();
  if (!wanted) return null;
  try {
    const brand = (await listBrands()).find((b) => b.name.toLowerCase() === wanted);
    if (!brand) return null;
    return { ...brand, logo: (await brandLogoMap()).get(brandKey(brand.name)) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const brand = await findBrand((await searchParams).brand);
  if (brand) {
    return {
      title: `${brand.name} products`,
      description: `Shop ${brand.name} products at VALTA.LK.`,
      alternates: { canonical: `/products?brand=${encodeURIComponent(brand.name)}` },
    };
  }
  return {
    title: "All products",
    description: "Browse mobile phones, electronics and accessories.",
    alternates: { canonical: "/products" },
  };
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const brand = await findBrand(params.brand);
  return (
    <>
      <Breadcrumbs
        items={
          brand
            ? [{ href: "/", label: "Home" }, { href: "/brands", label: "Brands" }, { label: brand.name }]
            : [{ href: "/", label: "Home" }, { label: "All products" }]
        }
      />
      {brand ? <BrandHeader name={brand.name} count={brand.count} image={brand.image} logo={brand.logo} /> : <h1 className="page-title mb-6">All products</h1>}
      <CatalogueView basePath="/products" params={params} />
    </>
  );
}
