import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { ErpUnavailable } from "@/components/ui/states";
import { listProducts } from "@/lib/erp/catalogue";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

async function findCategory(slug: string) {
  const { categories } = await listProducts({ pageSize: 1 });
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await findCategory(slug);
    if (!c) return { title: "Category not found", robots: { index: false } };
    return { title: c.name, description: `Shop ${c.name} at VOLTA.LK.`, alternates: { canonical: `/categories/${slug}` } };
  } catch {
    return { title: "Category" };
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  let category;
  try {
    category = await findCategory(slug);
  } catch {
    return <ErpUnavailable retryHref={`/categories/${slug}`} />;
  }
  if (!category) notFound();
  const query = await searchParams;
  const sub = category.subs.find((s) => s.slug === query.sub);

  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "All products" },
          sub ? { href: `/categories/${slug}`, label: category.name } : { label: category.name },
          ...(sub ? [{ label: sub.name }] : []),
        ]}
        title={category.name}
        intro={`${category.count} ${category.count === 1 ? "product" : "products"} in this category.`}
      />
      <CatalogueView basePath={`/categories/${slug}`} params={query} fixedCategory={slug} />
    </>
  );
}
