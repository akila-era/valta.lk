import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/layout/policy-page";
import { listBrands, listProducts } from "@/lib/erp/catalogue";
import { BUILT_IN_PAGES, getContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "Sitemap", alternates: { canonical: "/site-map" } };

/** A page listing every part of the store (as ugreen.lk's footer "Sitemap"): shop pages, categories, brands, information. */
export default async function SiteMapPage() {
  const [cats, brands, pages] = await Promise.all([
    listProducts({ pageSize: 1 }).then((r) => r.categories).catch(() => []),
    listBrands().catch(() => []),
    getContent("pages"),
  ]);
  const custom = Object.entries(pages ?? {}).filter(([, p]) => p.custom);
  const info = Object.entries(BUILT_IN_PAGES).map(([slug, p]) => ({ href: p.path, label: pages?.[slug]?.title || p.title }));
  const col = (title: string, links: { href: string; label: string }[]) =>
    links.length ? (
      <section>
        <h2>{title}</h2>
        <ul>
          {links.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
        </ul>
      </section>
    ) : null;

  return (
    <PolicyPage title="Sitemap">
      <div className="grid gap-8 sm:grid-cols-2">
        {col("Shop", [
          { href: "/products", label: "All products" },
          { href: "/new-arrivals", label: "New arrivals" },
          { href: "/products?sale=1", label: "Deals" },
          { href: "/brands", label: "Brands" },
          { href: "/compare", label: "Compare products" },
          { href: "/wishlist", label: "Wishlist" },
        ])}
        {col("Help", [
          { href: "/track-order", label: "Track your order" },
          { href: "/faqs", label: "Frequently asked questions" },
          { href: "/contact", label: "Contact us" },
          { href: "/account", label: "My account" },
        ])}
        {col("Categories", cats.map((c) => ({ href: `/categories/${c.slug}`, label: c.name })))}
        {col("Information", [...info, ...custom.map(([slug, p]) => ({ href: `/p/${slug}`, label: p.title }))])}
        {col("Brands", brands.map((b) => ({ href: `/products?brand=${encodeURIComponent(b.name)}`, label: b.name })))}
      </div>
    </PolicyPage>
  );
}
