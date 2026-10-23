import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Ready for dispatch" };
export const dynamic = "force-dynamic";

export default async function ReadyForDispatchPage() {
  const denied = await adminGate("/admin/orders/ready-for-dispatch");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Ready for dispatch" />
      <NotAvailable title="The ERP has no separate &quot;ready for dispatch&quot; status" purpose="List orders that are packed and waiting for a courier." why="ERP orders move Placed, Confirmed, Dispatched, Delivered or Cancelled. Dispatching (and the tracking number) is done in the ERP. Confirmed orders are the ones waiting to be dispatched.">
        <Link href="/admin/orders?status=CONFIRMED" className="btn-primary">See confirmed orders</Link>
      </NotAvailable>
    </>
  );
}
