import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, XCircle } from "lucide-react";
import { ProductTable } from "@/components/admin/product-table";
import { ErrorNote, PageHeader, Pager, Stat } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { catalogue, isLow, isOut, LOW_STOCK_AT } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string; size?: string }> }) {
  const denied = await adminGate("/admin/inventory");
  if (denied) return denied;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Inventory" /><ErrorNote>Stock levels could not be loaded from the ERP.</ErrorNote></>);

  const sp = await searchParams;
  const size = parseSize(sp.size);
  const out = cat.products.filter(isOut).length;
  const low = cat.products.filter(isLow).length;
  const sorted = [...cat.products].sort((a, b) => a.purchasableQuantity - b.purchasableQuantity || a.name.localeCompare(b.name));
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));

  return (
    <>
      <PageHeader title="Inventory" subtitle={`Stock is read from the ERP (purchasable quantity, after reservations). Refreshed ${cat.syncedAt.toLocaleTimeString("en-LK")}. Low stock means ${LOW_STOCK_AT} or fewer.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Boxes} tone="purple" label="Products" value={cat.products.length} />
        <Stat icon={CheckCircle2} tone="green" label="In stock" value={cat.products.length - low - out} />
        <Stat icon={AlertTriangle} tone="orange" label="Low stock" value={low} href="/admin/inventory/low-stock" />
        <Stat icon={XCircle} tone="red" label="Out of stock" value={out} href="/admin/inventory/low-stock" />
      </div>
      <ProductTable products={sorted.slice((page - 1) * size, page * size)} label="Stock levels, lowest first" />
      <Pager page={page} pageCount={pageCount} href={(n) => `/admin/inventory?${new URLSearchParams({ ...(size !== 25 ? { size: String(size) } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`} total={sorted.length} pageSize={size} noun="products" />
      <p className="mt-4 text-sm text-muted">Stock can only be changed in the ERP. <Link href="/admin/erp/inventory" className="font-semibold text-brand-600 hover:underline">Inventory sync status</Link></p>
    </>
  );
}
