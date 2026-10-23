import type { Metadata } from "next";
import { Empty, NotAvailable, PageHeader, Table } from "@/components/admin/ui";
import { adminEmails } from "@/lib/admin/auth";
import { adminDb, adminGate } from "@/lib/admin/gate";

export const metadata: Metadata = { title: "Admin users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const denied = await adminGate("/admin/users");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const emails = adminEmails();
  const accounts = await db.customer.findMany({ where: { email: { in: emails } }, select: { email: true, name: true, createdAt: true } });
  const byEmail = new Map(accounts.map((a) => [a.email, a]));

  return (
    <>
      <PageHeader title="Admin users" subtitle="Staff are the website accounts whose email is listed in the ADMIN_EMAILS setting on the server. This list is read-only." />
      {emails.length === 0 ? (
        <Empty>No admin emails are configured.</Empty>
      ) : (
        <Table label="Admin users" min="30rem" head={["Email", "Name", "Account"]}>
          {emails.map((e) => {
            const a = byEmail.get(e);
            return (
              <tr key={e}>
                <td className="px-4 py-3">{e}</td>
                <td className="px-4 py-3">{a?.name ?? "-"}</td>
                <td className="px-4 py-3">{a ? <span className="badge bg-success-bg text-success">Registered</span> : <span className="badge bg-warn-bg text-warn">No account yet</span>}</td>
              </tr>
            );
          })}
        </Table>
      )}
      <div className="mt-6">
        <NotAvailable title="Adding and removing staff" why="Staff access is controlled by a server setting rather than stored data, so it cannot be changed from this page." needs={["Change ADMIN_EMAILS on the server and restart, or add a staff table with an invite flow."]} />
      </div>
    </>
  );
}
