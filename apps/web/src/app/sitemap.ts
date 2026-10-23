import type { MetadataRoute } from "next";
import { getSnapshot } from "@/lib/erp/catalogue";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const STATIC = ["", "/products", "/track-order", "/about", "/contact", "/privacy-policy", "/terms", "/shipping-policy", "/returns-policy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${siteConfig.url}${p}` }));
  try {
    const { products } = await getSnapshot();
    const cats = new Map<string, string>();
    for (const p of products.values()) {
      entries.push({ url: `${siteConfig.url}/products/${p.slug}`, lastModified: p.updatedAt });
      if (p.category) cats.set(p.category.slug, p.category.name);
    }
    for (const slug of cats.keys()) entries.push({ url: `${siteConfig.url}/categories/${slug}` });
  } catch {
    /* ERP unreachable: serve static entries only */
  }
  return entries;
}
