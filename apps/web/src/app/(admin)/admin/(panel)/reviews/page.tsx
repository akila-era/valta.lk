import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CheckCircle2, Clock, Star, XCircle } from "lucide-react";
import { ReviewActions } from "@/components/admin/review-actions";
import { Empty, ErrorNote, PageHeader, Pager, Segmented, Stat, Table } from "@/components/admin/ui";
import { Stars } from "@/components/products/stars";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { getDb } from "@/lib/db";
import { getErpSnapshot } from "@/lib/erp/catalogue";

export const metadata: Metadata = { title: "Product Reviews" };
export const dynamic = "force-dynamic";

type SP = { status?: string; page?: string; size?: string };
const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type Status = (typeof STATUSES)[number];
const LABEL: Record<Status, string> = { PENDING: "Waiting", APPROVED: "Published", REJECTED: "Rejected" };

/**
 * Admin: customer reviews written on product pages. New reviews wait here until staff approve them; only approved
 * ones appear on the website (product page, card stars, homepage). Rejected ones stay hidden and can be approved later.
 */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/reviews");
  if (denied) return denied;
  const sp = await searchParams;
  const status: Status = STATUSES.find((s) => s === sp.status) ?? "PENDING";
  const db = getDb();
  const header = (
    <PageHeader
      title="Product Reviews"
      subtitle="Reviews shoppers write on product pages. Nothing appears on the website until you approve it. Approve honest reviews, good and bad; reject spam, abuse or personal details."
    />
  );
  if (!db) return (<>{header}<ErrorNote>The website database is not configured, so reviews cannot be stored.</ErrorNote></>);

  const size = parseSize(sp.size);
  const [counts, average] = await Promise.all([
    db.productReview.groupBy({ by: ["status"], _count: { _all: true } }),
    db.productReview.aggregate({ where: { status: "APPROVED" }, _avg: { rating: true } }),
  ]);
  const count = (s: Status) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const total = count(status);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const [rows, snapshot] = await Promise.all([
    db.productReview.findMany({ where: { status }, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, skip: (page - 1) * size, take: size }),
    getErpSnapshot().catch(() => null),
  ]);
  const href = (n: number, s: Status = status) => {
    const p = new URLSearchParams();
    if (s !== "PENDING") p.set("status", s);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/reviews${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      {header}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Clock} tone={count("PENDING") ? "orange" : "grey"} label="Waiting for approval" value={count("PENDING")} href={href(1, "PENDING")} />
        <Stat icon={CheckCircle2} tone="green" label="Published" value={count("APPROVED")} href={href(1, "APPROVED")} />
        <Stat icon={XCircle} tone="grey" label="Rejected" value={count("REJECTED")} href={href(1, "REJECTED")} />
        <Stat icon={Star} tone="purple" label="Average published rating" value={average._avg.rating ? average._avg.rating.toFixed(1) : "-"} />
      </div>

      <div className="mb-4">
        <Segmented label="Show" current={status} options={STATUSES.map((s) => ({ value: s, label: `${LABEL[s]} (${count(s)})`, href: href(1, s) }))} />
      </div>

      {rows.length === 0 ? (
        <Empty>{status === "PENDING" ? "No reviews are waiting. New ones appear here as shoppers send them." : `No ${LABEL[status].toLowerCase()} reviews.`}</Empty>
      ) : (
        <>
          <Table label="Reviews" min="56rem" head={["Review", "Product", "From", { label: "Actions", right: true }]}>
            {rows.map((r) => {
              const product = snapshot?.products.get(r.erpItemId);
              return (
                <tr key={r.id} className="align-top">
                  <td className="max-w-md">
                    <Stars rating={r.rating} size="h-3.5 w-3.5" />
                    {r.title ? <p className="mt-1 font-semibold">{r.title}</p> : null}
                    <p className="mt-1 whitespace-pre-line text-sm text-ink/90">{r.body}</p>
                  </td>
                  <td>
                    {product ? (
                      <Link href={`/products/${product.slug}`} target="_blank" className="font-medium text-brand-600 hover:underline">{product.name}</Link>
                    ) : (
                      <span className="text-muted">No longer in the catalogue</span>
                    )}
                  </td>
                  <td className="text-sm">
                    <p className="font-medium">{r.name}</p>
                    {r.verified ? <p className="inline-flex items-center gap-1 text-xs font-semibold text-success"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified buyer</p> : null}
                    <p className="text-xs text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </td>
                  <td><ReviewActions id={r.id} status={r.status} /></td>
                </tr>
              );
            })}
          </Table>
          <Pager page={page} pageCount={pageCount} href={(n) => href(n)} total={total} pageSize={size} noun="reviews" />
        </>
      )}
    </>
  );
}
