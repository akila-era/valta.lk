import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { requireAdmin } from "@/lib/admin/auth";
import type { AdminBadges } from "@/lib/admin/nav";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | VOLTA.LK Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function badges(): Promise<AdminBadges> {
  const none = { new: 0, pending: 0, failed: 0 };
  const db = getDb();
  if (!db) return none;
  try {
    const [n, rows] = await Promise.all([db.webOrder.count({ where: { erpStatus: "PLACED" } }), db.webOrder.groupBy({ by: ["syncStatus"], _count: { _all: true } })]);
    const c = Object.fromEntries(rows.map((r) => [r.syncStatus, r._count._all]));
    return { new: n, pending: c.PENDING ?? 0, failed: c.FAILED ?? 0 };
  } catch {
    return none;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdmin();
  // Not signed in / not staff: the page itself redirects or explains; no admin chrome is shown to them.
  if (access.kind !== "ok") return <div className="grid min-h-screen place-items-center bg-surface p-4">{children}</div>;
  return (
    <AdminShell user={{ name: access.admin.name, email: access.admin.email }} badges={await badges()}>
      {children}
    </AdminShell>
  );
}
