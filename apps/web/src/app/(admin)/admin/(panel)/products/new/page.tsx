import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Add product" };
export const dynamic = "force-dynamic";

export default async function AddProductPage() {
  const denied = await adminGate("/admin/products/new");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Add product" />
      <NotAvailable
        title="Products are created in the HEXALYTE ERP" purpose="Create a product (name, SKU, price, images, stock) so it appears on the storefront."
        why="The ERP is the single source of truth for products, prices and stock. Its store API is read-only for the catalogue, so a product created here could not be saved anywhere. Add the product in the ERP and it appears on the website (and in this admin) within about a minute."
        needs={["A product-create endpoint in the ERP store API, if you want to add products from this screen in future."]}
      >
        <Link href="/admin/products" className="btn-secondary">View the catalogue</Link>
      </NotAvailable>
    </>
  );
}
