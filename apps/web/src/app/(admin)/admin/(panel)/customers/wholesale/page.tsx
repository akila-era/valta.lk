import type { Metadata } from "next";
import { Briefcase, Inbox } from "lucide-react";
import { WholesaleStatus } from "@/components/admin/wholesale-status";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Wholesale Applications" };
export const dynamic = "force-dynamic";

type SP = { page?: string; size?: string; status?: string };

/** Admin: businesses that sent the "Apply Wholesale" form, newest first, with their status. */
export default async function WholesalePage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/customers/wholesale");
  if (denied) return denied;
  const sp = await searchParams;
  const db = getDb();
  const header = <PageHeader title="Wholesale Applications" subtitle="Businesses that applied for wholesale on the website (Apply Wholesale in the header). Contact them, then mark them as contacted." />;
  if (!db) return (<>{header}<ErrorNote>The website database is not configured, so applications cannot be stored.</ErrorNote></>);

  const status = sp.status === "NEW" || sp.status === "CONTACTED" ? sp.status : undefined;
  const where = status ? { status } : {};
  const size = parseSize(sp.size);
  const [total, open, matching] = await Promise.all([
    db.wholesaleApplication.count(),
    db.wholesaleApplication.count({ where: { status: "NEW" } }),
    db.wholesaleApplication.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const rows = await db.wholesaleApplication.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size });
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/customers/wholesale${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      {header}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Stat icon={Briefcase} tone="purple" label="Applications" value={total} />
        <Stat icon={Inbox} tone={open ? "orange" : "grey"} label="Not contacted yet" value={open} href="/admin/customers/wholesale?status=NEW" />
      </div>
      {rows.length === 0 ? (
        <Empty>{status ? "No applications with this status." : "No applications yet. The form is at /wholesale (Apply Wholesale in the header)."}</Empty>
      ) : (
        <>
          <Table dense label="Wholesale applications" min="60rem" head={["Business", "Contact", "City", "Wants", "Sent", "Status", { label: "Action", right: true }]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-3 font-medium">{r.business}</td>
                <td className="px-3 py-3">
                  <span className="block">{r.name}</span>
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="block text-sm text-muted hover:underline">{r.phone}</a>
                  {r.email ? <a href={`mailto:${r.email}`} className="block text-sm text-muted hover:underline">{r.email}</a> : null}
                </td>
                <td className="px-3 py-3 text-muted">{r.city ?? "-"}</td>
                <td className="max-w-xs px-3 py-3 text-sm text-muted">{r.message ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${r.status === "NEW" ? "bg-warn-bg text-warn" : "bg-surface text-ink"}`}>{r.status === "NEW" ? "New" : "Contacted"}</span>
                </td>
                <td className="px-3 py-3 text-right"><WholesaleStatus id={r.id} status={r.status} /></td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageCount={pageCount} href={href} total={matching} pageSize={size} noun="applications" />
        </>
      )}
    </>
  );
}
