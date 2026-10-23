import type { Metadata } from "next";
import { AlertTriangle, Boxes, CheckCircle2, XCircle } from "lucide-react";
import { StockList, type StockListParams } from "@/components/admin/stock-list";
import { ErrorNote, PageHeader, Stat } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { catalogue, isLow, isOut, LOW_STOCK_AT } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Low stock" };
export const dynamic = "force-dynamic";

export default async function LowStockPage({ searchParams }: { searchParams: Promise<StockListParams> }) {
  const denied = await adminGate("/admin/inventory/low-stock");
  if (denied) return denied;
  const sp = await searchParams;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Low stock" /><ErrorNote>Stock levels could not be loaded from the ERP.</ErrorNote></>);
  const out = cat.products.filter(isOut).length;
  const low = cat.products.filter(isLow).length;
  return (
    <>
      <PageHeader title="Low stock" subtitle={`Products with ${LOW_STOCK_AT} or fewer available, and products that are out of stock. Stock is changed in the ERP.`} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Boxes} tone="purple" label="Total products" value={cat.products.length} href="/admin/products" />
        <Stat icon={CheckCircle2} tone="green" label="In stock" value={cat.products.length - low - out} href="/admin/products?stock=in" />
        <Stat icon={AlertTriangle} tone="orange" label="Low stock" value={low} sub={`${LOW_STOCK_AT} or fewer left`} href="/admin/inventory/low-stock?stock=low" />
        <Stat icon={XCircle} tone="red" label="Out of stock" value={out} href="/admin/inventory/out-of-stock" />
      </div>
      <StockList products={cat.products.filter((p) => isLow(p) || isOut(p))} basePath="/admin/inventory/low-stock" sp={sp} pills emptyText="No products are low on stock." />
    </>
  );
}
