import type { Metadata } from "next";
import Link from "next/link";
import { NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Roles & permissions" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const denied = await adminGate("/admin/roles");
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Roles & permissions" />
      <NotAvailable
        title="There is one staff role" purpose="Give different staff different access, for example support, warehouse or finance."
        why="Everyone on the admin list has the same access: view orders, retry ERP sync and read ERP-sourced catalogue data. Nothing in the admin can change prices, stock or products, because those live in the ERP."
        needs={["A roles/permissions table and per-page permission checks, if you need limited roles such as support or warehouse staff."]}
      >
        <Link href="/admin/users" className="btn-secondary">See who has admin access</Link>
      </NotAvailable>
    </>
  );
}
