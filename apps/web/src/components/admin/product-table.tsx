import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import type { ErpProduct } from "@/lib/erp/types";
import { effectivePrice } from "@/lib/erp/product-utils";
import { isLow, isOut } from "@/lib/admin/stats";
import { formatLkr } from "@/lib/utils/money";
import { Empty, Table } from "./ui";

/** What the admin list shows about a product's website content (computed on the server). */
export interface ContentState {
  publication: "published" | "draft-only" | "none";
  unpublishedChanges: boolean;
  complete: boolean;
  updatedAt: Date | null;
}

export function PublicationBadge({ c }: { c?: ContentState }) {
  if (!c || c.publication === "none") return <span className="badge bg-surface text-muted">No content</span>;
  if (c.publication === "draft-only") return <span className="badge bg-warn-bg text-warn">Draft</span>;
  return <span className="badge bg-success-bg text-success">{c.unpublishedChanges ? "Published + draft" : "Published"}</span>;
}

export function CompletenessBadge({ c }: { c?: ContentState }) {
  if (!c || c.publication === "none") return <span className="text-muted">-</span>;
  return c.complete ? <span className="badge bg-success-bg text-success">Complete</span> : <span className="badge bg-brand-50 text-brand-700">Incomplete</span>;
}

export function StockBadge({ p }: { p: ErpProduct }) {
  if (isOut(p)) return <span className="badge bg-danger-bg text-danger">Out of stock</span>;
  if (isLow(p)) return <span className="badge bg-warn-bg text-warn">Low stock</span>;
  return <span className="badge bg-success-bg text-success">In stock</span>;
}

function Thumb({ p, size }: { p: ErpProduct; size: number }) {
  return (
    <span className="relative shrink-0 overflow-hidden rounded-md bg-surface" style={{ width: size, height: size }}>
      {p.images[0] ? <Image src={p.images[0]} alt="" fill sizes={`${size}px`} className="object-contain p-1" /> : <Smartphone className="m-auto h-full w-5 text-muted" aria-hidden />}
    </span>
  );
}

export function ProductTable({ products, label, content }: { products: ErpProduct[]; label: string; content?: Map<string, ContentState> }) {
  if (!products.length) return <Empty>No products match.</Empty>;
  const when = (d?: Date | null) => (d ? d.toLocaleDateString("en-LK", { month: "short", day: "numeric", year: "numeric" }) : "-");
  return (
    <>
      {/* Phones: one card per product so price, stock and status are never hidden behind a sideways scroll */}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg md:hidden" aria-label={label}>
        {products.map((p) => (
          <li key={p.id} className="flex gap-3 p-3">
            <Thumb p={p} size={48} />
            <div className="min-w-0 flex-1">
              <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline" title="Edit website content">{p.name}</Link>
              <p className="mt-0.5 truncate font-mono text-xs text-muted">{p.sku ?? "No SKU"}{p.category ? ` · ${p.category.name}` : ""}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold tabular-nums">{formatLkr(effectivePrice(p))}</span>
                <span className="text-muted">{Math.max(0, p.purchasableQuantity)} in stock</span>
                <StockBadge p={p} />
                {content && <PublicationBadge c={content.get(p.id)} />}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table
          dense
          label={label}
          min={content ? "72rem" : "60rem"}
          head={content
            ? ["Product", "ERP ID", "Category", "Brand", { label: "Price", right: true }, { label: "Stock", right: true }, "Content", "Publication", "Updated", { label: "Actions", right: true }]
            : ["Product", "SKU", "Category", "Brand", { label: "Price", right: true }, { label: "Stock", right: true }, "Stock status", "Store", "ERP data", { label: "Actions", right: true }]}
        >
          {products.map((p) => {
            const c = content?.get(p.id);
            return (
              <tr key={p.id}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb p={p} size={40} />
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline" title="Edit website content">{p.name}</Link>
                      {content && <span className="block font-mono text-[11px] text-muted">{p.sku ?? "No SKU"}</span>}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{content ? p.id : (p.sku ?? "-")}</td>
                <td className="px-3 py-3 leading-5">{p.category?.name ?? "-"}</td>
                <td className="px-3 py-3">{p.brand ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatLkr(effectivePrice(p))}</td>
                <td className="px-3 py-3 text-right">{Math.max(0, p.purchasableQuantity)}{content && <span className="mt-0.5 block"><StockBadge p={p} /></span>}</td>
                {content ? (
                  <>
                    <td className="px-3 py-3"><CompletenessBadge c={c} /></td>
                    <td className="px-3 py-3"><PublicationBadge c={c} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{when(c?.updatedAt)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3"><StockBadge p={p} /></td>
                    <td className="px-3 py-3"><span className="badge bg-success-bg text-success">Published</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted" title="Last change reported by the ERP catalogue">{new Date(p.updatedAt).toLocaleDateString("en-LK", { month: "short", day: "numeric" })}</td>
                  </>
                )}
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                  <Link href={`/admin/products/${p.id}`} className="font-semibold text-brand-600 hover:underline">{content ? "Edit content" : "Edit"}</Link>
                  <span className="mx-2 text-border" aria-hidden>|</span>
                  <Link href={`/products/${p.slug}${content ? "?preview=1" : ""}`} target="_blank" rel="noopener" className="text-muted hover:text-ink">{content ? "Preview" : "View"}</Link>
                  {content && (<><span className="mx-2 text-border" aria-hidden>|</span><Link href="/admin/erp/products" className="text-muted hover:text-ink">Sync</Link></>)}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
