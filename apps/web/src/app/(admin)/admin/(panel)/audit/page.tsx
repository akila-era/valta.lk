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
        why="No audit table exists. Admins can retry order syncs, edit and publish product content and images, link accessories, and manage promotions, banners, hot deals, brand logos and the ERP connection. None of this is logged as a history: product content, banners, hot deals, brand logos and the ERP connection keep only who changed them last, accessory links who created them, and promotions nothing. Order sync attempts are counted and their last error is kept on the order (see Order sync)."
        needs={["An audit-log table and writes from each admin action (sign-in, sync retry, content, marketing and settings changes)."]}
      >
        <Link href="/admin/erp/orders" className="btn-secondary">See order sync attempts</Link>
      </NotAvailable>
    </>
  );
}
