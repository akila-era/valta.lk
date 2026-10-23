import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueView, type RawParams } from "@/components/products/catalogue-view";
import { Breadcrumbs } from "@/components/ui/chrome";
import { ErpUnavailable } from "@/components/ui/states";
import { listProducts } from "@/lib/erp/catalogue";

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
    return { title: c.name, description: `Shop ${c.name} at VALTA.LK.`, alternates: { canonical: `/categories/${slug}` } };
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
      <Breadcrumbs
        items={[
          { href: "/", label: "Home" },
          { href: "/products", label: "All products" },
          sub ? { href: `/categories/${slug}`, label: category.name } : { label: category.name },
          ...(sub ? [{ label: sub.name }] : []),
        ]}
      />
      <h1 className="page-title">{category.name}</h1>
      <p className="type-meta mb-6 mt-2">{category.count} {category.count === 1 ? "product" : "products"} in this category.</p>
      <CatalogueView basePath={`/categories/${slug}`} params={query} fixedCategory={slug} />
    </>
  );
}
