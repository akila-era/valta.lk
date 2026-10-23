import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Featured products" };
export const dynamic = "force-dynamic";

export default async function FeaturedPage() {
  const denied = await adminGate("/admin/featured");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Featured products" />
      <NotAvailable
        title="No featured-product setting exists yet" purpose="Hand-pick which products are highlighted on the homepage."
        why="The homepage product showcase is built from ERP data (newest, on sale, most popular) and the ERP has no featured flag. Nothing is stored on the website for hand-picked products, so a selection made here would not change the storefront."
        needs={["A featured/pinned flag on products in the ERP, or a website table for hand-picked product ids plus the homepage wired to read it."]}
      >
        <Link href="/admin/products" className="btn-secondary">Browse the catalogue</Link>
        <Link href="/" className="btn-secondary">View the storefront homepage</Link>
      </NotAvailable>
    </>
  );
}
