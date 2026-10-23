import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { SyncTable } from "@/components/admin/sync-table";
import { adminDb, adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Failed sync jobs" };
export const dynamic = "force-dynamic";

export default async function FailedSyncPage() {
  const denied = await adminGate("/admin/erp/failed");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const rows = await db.webOrder.findMany({ where: { syncStatus: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Failed sync jobs" subtitle="Orders the ERP rejected or could not take after repeated tries. They are not retried automatically: fix the cause (for example stock or an inactive product), then press Retry." />
      <SyncTable rows={rows} empty="No failed sync jobs." />
    </>
  );
}
