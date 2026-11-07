import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Inbox } from "lucide-react";
import { ResendPreorderMessage } from "@/components/admin/preorder-message-settings";
import { PreorderStatus } from "@/components/admin/preorder-status";
import { Empty, ErrorNote, PageHeader, Pager, Stat, Table } from "@/components/admin/ui";
import { getWaSettings } from "@/lib/whatsapp/settings";
import { adminGate } from "@/lib/admin/gate";
import { parseSize } from "@/lib/admin/paging";
import { getDb } from "@/lib/db";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "Pre-orders" };
export const dynamic = "force-dynamic";

type SP = { page?: string; size?: string; status?: string };
const LABEL: Record<string, string> = { NEW: "New", CONTACTED: "Contacted", CLOSED: "Closed" };

/** A wa.me link to the customer with a ready message, for confirming payment and the order. */
function whatsappLink(phone: string, ref: string, product: string, qty: number) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `94${digits.slice(1)}`; // a Sri Lankan local number
  const text = `Hello, this is ${siteConfig.name} about your pre-order ${ref}: ${qty} x ${product}. We would like to confirm the payment and your order.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Admin: pre-order requests for out-of-stock products, newest first. They are not ERP orders and nothing was paid. */
export default async function PreordersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const denied = await adminGate("/admin/orders/preorders");
  if (denied) return denied;
  const sp = await searchParams;
  const db = getDb();
  const header = (
    <PageHeader
      title="Pre-orders"
      subtitle="Requests for products that are out of stock. Nothing was paid and nothing was sent to the ERP: contact the customer on WhatsApp to confirm payment and the order, then place the order."
    />
  );
  if (!db) return (<>{header}<ErrorNote>The website database is not configured, so pre-orders cannot be stored.</ErrorNote></>);

  const status = sp.status && sp.status in LABEL ? sp.status : undefined;
  const where = status ? { status } : {};
  const size = parseSize(sp.size);
  const [total, open, matching] = await Promise.all([
    db.preOrderRequest.count(),
    db.preOrderRequest.count({ where: { status: "NEW" } }),
    db.preOrderRequest.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / size));
  const page = Math.min(pageCount, Math.max(1, Number(sp.page) || 1));
  const [rows, wa] = await Promise.all([
    db.preOrderRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
    getWaSettings().catch(() => null),
  ]);
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (size !== 25) p.set("size", String(size));
    if (n > 1) p.set("page", String(n));
    return `/admin/orders/preorders${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      {header}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Stat icon={CalendarClock} tone="purple" label="Pre-orders" value={total} />
        <Stat icon={Inbox} tone={open ? "orange" : "grey"} label="Not contacted yet" value={open} href="/admin/orders/preorders?status=NEW" />
      </div>
      <p className="mb-5 rounded-card border border-border bg-bg p-3 text-sm text-muted">
        {wa?.mode && wa.mode !== "off" ? "Customers get a WhatsApp message when they send a pre-order. " : "WhatsApp is not connected, so customers get no WhatsApp message. "}
        Choose or edit the message templates in <Link href="/admin/whatsapp#preorder-message" className="font-semibold text-ink underline">Customers, WhatsApp Chat</Link>.
      </p>
      {rows.length === 0 ? (
        <Empty>{status ? "No pre-orders with this status." : "No pre-orders yet. Customers can send one from the page of a product that is out of stock."}</Empty>
      ) : (
        <>
          <Table dense label="Pre-orders" min="72rem" head={["Reference", "Product", "Customer", "WhatsApp message", "Note", "Sent", "Status", { label: "Action", right: true }]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-sm font-semibold">{r.ref}</td>
                <td className="px-3 py-3">
                  <Link href={`/products/${r.productSlug}`} target="_blank" className="font-medium hover:underline">{r.productName}</Link>
                  <span className="block text-sm text-muted">Qty {r.quantity}{r.sku ? ` · ${r.sku}` : ""}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block">{r.name}</span>
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="block text-sm text-muted hover:underline">{r.phone}</a>
                  {r.email ? <a href={`mailto:${r.email}`} className="block text-sm text-muted hover:underline">{r.email}</a> : null}
                  {r.city ? <span className="block text-sm text-muted">{r.city}</span> : null}
                  <a href={whatsappLink(r.phone, r.ref, r.productName, r.quantity)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-semibold text-[#128c4a] hover:underline">
                    Message on WhatsApp
                  </a>
                </td>
                <td className="px-3 py-3 text-sm">
                  {r.waStatus === "SENT" ? (
                    <span className="font-semibold text-stock-in">Sent</span>
                  ) : r.waStatus === "FAILED" ? (
                    <span className="block font-semibold text-danger" title={r.waError ?? undefined}>Not sent{r.waError ? `: ${r.waError}` : ""}</span>
                  ) : (
                    <span className="text-muted">Not sent</span>
                  )}
                  {r.waStatus !== "SENT" ? <ResendPreorderMessage id={r.id} /> : null}
                </td>
                <td className="max-w-xs px-3 py-3 text-sm text-muted">{r.note ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{r.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${r.status === "NEW" ? "bg-warn-bg text-warn" : "bg-surface text-ink"}`}>{LABEL[r.status] ?? r.status}</span>
                </td>
                <td className="px-3 py-3 text-right"><PreorderStatus id={r.id} status={r.status} /></td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageCount={pageCount} href={href} total={matching} pageSize={size} noun="pre-orders" />
        </>
      )}
    </>
  );
}
