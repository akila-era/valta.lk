import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { StockList, type StockListParams } from "@/components/admin/stock-list";
import { ErrorNote, PageHeader, Panel, Stat } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { catalogue, isLow, isOut, LOW_STOCK_AT } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Inventory sync" };
export const dynamic = "force-dynamic";

export default async function InventorySyncPage({ searchParams }: { searchParams: Promise<StockListParams> }) {
  const denied = await adminGate("/admin/erp/inventory");
  if (denied) return denied;
  const sp = await searchParams;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Inventory sync" /><ErrorNote>Stock could not be loaded from the ERP just now.</ErrorNote></>);
  const out = cat.products.filter(isOut).length;
  const low = cat.products.filter(isLow).length;
  return (
    <>
      <PageHeader title="Inventory sync" subtitle="Stock comes from the ERP with the catalogue and is re-checked live at checkout; the website never stores or edits stock levels." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={RefreshCw} tone="blue" label="Last stock refresh" value={cat.syncedAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })} sub={cat.syncedAt.toLocaleDateString("en-LK", { dateStyle: "medium" })} />
        <Stat icon={CheckCircle2} tone="green" label="In stock" value={cat.products.length - low - out} href="/admin/products?stock=in" />
        <Stat icon={AlertTriangle} tone="orange" label="Low stock" value={low} sub={`${LOW_STOCK_AT} or fewer left`} href="/admin/erp/inventory?stock=low" />
        <Stat icon={XCircle} tone="red" label="Out of stock" value={out} href="/admin/erp/inventory?stock=out" />
      </div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Boxes className="h-5 w-5 text-muted" aria-hidden /> Products needing attention</h2>
      <StockList products={cat.products.filter((p) => isLow(p) || isOut(p))} basePath="/admin/erp/inventory" sp={sp} pills emptyText="Every product has healthy stock." />
      <Panel className="mt-6" title="Reservations" id="res">
        <p className="text-sm text-muted">Stock held for customers who are checking out is managed by the ERP. See <Link href="/admin/erp" className="font-semibold text-brand-600 hover:underline">ERP settings</Link> to see whether reservations are enabled.</p>
      </Panel>
    </>
  );
}
