import type { Metadata } from "next";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { SyncTable } from "@/components/admin/sync-table";
import { adminDb, adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Order sync" };
export const dynamic = "force-dynamic";

export default async function OrderSyncPage() {
  const denied = await adminGate("/admin/erp/orders");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const [groups, open] = await Promise.all([
    db.webOrder.groupBy({ by: ["syncStatus"], _count: { _all: true } }),
    db.webOrder.findMany({ where: { syncStatus: { not: "SYNCED" } }, orderBy: { createdAt: "asc" }, take: 50 }),
  ]);
  const c = Object.fromEntries(groups.map((g) => [g.syncStatus, g._count._all]));
  const scheduler = Boolean(process.env.ORDER_SYNC_SECRET && process.env.ORDER_SYNC_SECRET.length >= 16);

  return (
    <>
      <PageHeader title="Order sync" subtitle="Every order is saved here first and then sent to the ERP. Orders that could not be sent are retried automatically; a retry can never create a duplicate order." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={CheckCircle2} tone="green" label="In ERP" value={c.SYNCED ?? 0} />
        <Stat icon={Clock} tone="orange" label="Waiting for ERP" value={c.PENDING ?? 0} sub="retried automatically" />
        <Stat icon={XCircle} tone="red" label="Need attention" value={c.FAILED ?? 0} href="/admin/erp/failed" />
      </div>
      <Panel className="mt-6" title="Automatic retries" id="sched">
        <p className="text-sm text-muted">
          Scheduler endpoint: <strong className={scheduler ? "text-success" : "text-warn"}>{scheduler ? "enabled" : "not enabled (ORDER_SYNC_SECRET is not set)"}</strong>.
          {" "}Without a scheduler calling it, waiting orders are still retried when someone opens them and when an admin presses Retry.
        </p>
      </Panel>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Not yet in the ERP</h2>
      <SyncTable rows={open} empty="Every order has reached the ERP." />
    </>
  );
}
