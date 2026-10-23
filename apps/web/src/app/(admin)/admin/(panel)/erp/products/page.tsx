import type { Metadata } from "next";
import { ErrorNote, PageHeader, Panel, Stat } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { catalogue } from "@/lib/admin/stats";
import { Boxes, ImageOff, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Product sync" };
export const dynamic = "force-dynamic";

export default async function ProductSyncPage() {
  const denied = await adminGate("/admin/erp/products");
  if (denied) return denied;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Product sync" /><ErrorNote>The catalogue could not be loaded from the ERP just now, so the last sync result is unknown.</ErrorNote></>);
  const noImage = cat.products.filter((p) => p.images.length === 0).length;
  const noCategory = cat.products.filter((p) => !p.category).length;
  return (
    <>
      <PageHeader title="Product sync" subtitle="The website keeps a cached copy of the ERP catalogue, refreshed at most once a minute (only changed products are fetched). Nothing is stored in the website database." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Boxes} tone="purple" label="Products synced" value={cat.products.length} sub={`last refresh ${cat.syncedAt.toLocaleTimeString("en-LK")}`} />
        <Stat icon={ImageOff} tone="orange" label="Without images" value={noImage} sub="shown with a placeholder" href="/admin/products" />
        <Stat icon={Tag} tone="blue" label="Without category" value={noCategory} sub="not listed in any category" />
      </div>
      <Panel className="mt-6" title="How it works" id="how">
        <p className="text-sm text-muted">Products are refreshed automatically when visitors browse; there is no manual job to run or fail. Prices and stock are always re-checked live at checkout.</p>
      </Panel>
    </>
  );
}
