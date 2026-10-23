import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ErrorNote, NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { catalogue } from "@/lib/admin/stats";

export const metadata: Metadata = { title: "Stock sync errors" };
export const dynamic = "force-dynamic";

export default async function StockSyncErrorsPage() {
  const denied = await adminGate("/admin/inventory/sync-errors");
  if (denied) return denied;
  const cat = await catalogue();
  return (
    <>
      <PageHeader title="Stock sync errors" />
      {cat ? (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-bg p-4 text-sm" role="status">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> The last catalogue and stock refresh from the ERP succeeded at {cat.syncedAt.toLocaleString("en-LK")}.
        </p>
      ) : (
        <ErrorNote>The ERP catalogue and stock could not be loaded just now. The storefront keeps working from its last good copy if it has one; checkout always re-checks stock live.</ErrorNote>
      )}
      <NotAvailable
        title="No per-item stock sync log is kept" purpose="List products whose stock failed to sync from the ERP, with the reason and a retry."
        why="Stock is not copied into the website database. It is read from the ERP when needed, so there are no queued stock sync jobs that can fail per item. The only failure that exists is the ERP being unreachable, which is shown above and on the ERP Integration page."
        needs={["A stock-sync job table and ERP webhooks would be needed to list historical per-item sync errors."]}
      >
        <Link href="/admin/erp" className="btn-secondary">Check ERP connection</Link>
        <Link href="/admin/inventory" className="btn-secondary">View stock levels</Link>
      </NotAvailable>
    </>
  );
}
