import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { ERP_LOGS } from "@/lib/admin/unavailable";

export const metadata: Metadata = { title: "Integration logs" };
export const dynamic = "force-dynamic";

export default async function ErpLogsPage() {
  const denied = await adminGate("/admin/erp/logs");
  if (denied) return denied;
  return (
    <>
      <PageHeader title={ERP_LOGS.title} />
      <NotAvailable title="Request logs are not stored" why={ERP_LOGS.why} needs={ERP_LOGS.needs}>
        <Link href={ERP_LOGS.link!.href} className="btn-primary mt-5">{ERP_LOGS.link!.label}</Link>
      </NotAvailable>
    </>
  );
}
