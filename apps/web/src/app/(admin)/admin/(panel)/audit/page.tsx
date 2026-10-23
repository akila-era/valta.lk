import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const denied = await adminGate("/admin/audit");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Audit logs" />
      <NotAvailable
        title="Admin actions are not logged yet" purpose="Show who did what in the admin and when, for accountability and troubleshooting."
        why="No audit table exists. The only admin write action is retrying an order sync, which is safe to repeat; each attempt is counted and its last error is kept on the order (see Order sync)."
        needs={["An audit-log table and writes from each admin action (sign-in, retry, future edits)."]}
      >
        <Link href="/admin/erp/orders" className="btn-secondary">See order sync attempts</Link>
      </NotAvailable>
    </>
  );
}
