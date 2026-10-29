import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, Mail, Search } from "lucide-react";
import { SubscriberRemove } from "@/components/admin/subscriber-remove";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Newsletter Subscribers" };
export const dynamic = "force-dynamic";

type SP = { q?: string; page?: string; size?: string };

/** The moment 30 days ago (outside the component: the clock is read once per request, not during render). */
const thirtyDaysAgo = () => new Date(Date.now() - 30 * 86_400_000);

/** Admin: shoppers who signed up in the footer for new arrivals and price drops; search, remove, export as CSV. */
export default async function SubscribersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/marketing/subscribers");
  if (denied) return denied;
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase().slice(0, 80) || undefined;
  const db = getDb();
  const header = (
    <PageHeader
      title="Newsletter Subscribers"
      subtitle="People who signed up in the website footer for new arrivals and price drops. Download the list for your email tool; remove anyone who asks to be taken off."
      actions={db ? <a href="/api/admin/newsletter" className="btn-primary"><Download className="h-4 w-4" aria-hidden /> Download CSV</a> : null}
    />
  );
  if (!db) return (<>{header}<ErrorNote>The website database is not configured, so sign-ups cannot be stored.</ErrorNote></>);

  const where = q ? { email: { contains: q } } : {};
  const since = thirtyDaysAgo();
  const size = parseSize(sp.size);
  const [total, matching, recent] = await Promise.all([
    db.newsletterSubscriber.count(),
    db.newsletterSubscriber.count({ where }),
    db.newsletterSubscriber.count({ where: { createdAt: { gte: since } } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const rows = await db.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size });
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/marketing/subscribers${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      {header}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Stat icon={Mail} tone="orange" label="Subscribers" value={total} />
        <Stat icon={CalendarDays} tone="green" label="New in the last 30 days" value={recent} />
      </div>

      <form action="/admin/marketing/subscribers" method="get" role="search" className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        {size !== 25 && <input type="hidden" name="size" value={size} />}
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="s-q" className="sr-only">Search subscribers</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="s-q" name="q" defaultValue={q} maxLength={80} placeholder="Search email…" className="input min-h-10 bg-surface pl-9" />
        </div>
        <button className="btn-primary min-h-10" type="submit">Apply</button>
        {q && <Link href="/admin/marketing/subscribers" className="text-sm font-semibold text-brand-600 hover:underline">Reset</Link>}
      </form>

      {rows.length === 0 ? (
        <Empty>{q ? "No subscribers match this search." : "No one has signed up yet. The sign-up form is in the website footer."}</Empty>
      ) : (
        <>
          <Table dense label="Subscribers" head={["Email", "Signed up", "Source", { label: "Remove", right: true }]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.email}</td>
                <td className="text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="text-muted">{r.source ?? "-"}</td>
                <td className="text-right"><SubscriberRemove id={r.id} email={r.email} /></td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageCount={pageCount} href={href} total={matching} pageSize={size} noun="subscribers" />
        </>
      )}
    </>
  );
}
