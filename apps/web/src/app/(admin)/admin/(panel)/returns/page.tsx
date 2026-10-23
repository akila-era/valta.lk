import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Returns & refunds" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const denied = await adminGate("/admin/returns");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Returns & refunds" />
      <NotAvailable
        title="Returns and refunds are not supported yet" purpose="Record return requests, approve them and track refunds."
        why="The ERP store API has no return or refund endpoints and the website has no return records. Customers can only cancel an order before it is dispatched. Returns are handled by your team outside the website."
        needs={["Return/refund endpoints in the ERP store API (or a website returns table and workflow)."]}
      >
        <Link href="/admin/orders?status=CANCELLED" className="btn-secondary">View cancelled orders</Link>
        <Link href="/admin/orders?status=DELIVERED" className="btn-secondary">View delivered orders</Link>
      </NotAvailable>
    </>
  );
}
