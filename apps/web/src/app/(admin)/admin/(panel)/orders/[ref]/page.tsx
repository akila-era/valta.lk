import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ErpBadge, SyncBadge } from "@/components/admin/badges";
import { CopyButton } from "@/components/admin/copy-button";
import { Facts, PageHeader, Panel } from "@/components/admin/ui";
import { RetryButton } from "@/components/admin/retry-button";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { paymentLabel } from "@/lib/admin/orders";
import type { CreateOrderRequest } from "@/lib/erp/types";
import { loadOrderView } from "@/lib/orders/public";
import type { DisplayLine } from "@/lib/orders/web-orders";
import { formatLkr, multiplyMoney } from "@/lib/utils/money";
import { orderRefParamSchema } from "@/lib/validation/checkout";

export const metadata: Metadata = { title: "Order (admin)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default async function AdminOrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref: raw } = await params;
  const ref = orderRefParamSchema.safeParse(raw.trim().toUpperCase());
  if (!ref.success) notFound();
  const denied = await adminGate(`/admin/orders/${ref.data}`);
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;

  const view = await loadOrderView(db, ref.data).catch(() => null);
  const row = view?.local ?? (await db.webOrder.findUnique({ where: { externalRef: ref.data } }));
  if (!row) notFound();
  const payload = row.payload as unknown as CreateOrderRequest;
  const items = (row.items as unknown as DisplayLine[]) ?? [];
  const live = view && !view.stale ? view.order : null;

  const tracking = live?.trackingNumber ?? row.trackingNumber;
  const carrier = live?.carrier ?? row.carrierName;
  const events: { at: Date; text: string; tone: "ok" | "warn" | "bad" | "info" }[] = [
    { at: row.createdAt, text: "Order placed and saved on the website", tone: "info" as const },
    ...(row.syncedAt ? [{ at: row.syncedAt, text: row.syncAttempts > 1 ? `Accepted by the ERP after ${row.syncAttempts} attempts` : "Accepted by the ERP", tone: "ok" as const }] : []),
    ...(row.lastError && row.syncStatus !== "SYNCED" ? [{ at: row.updatedAt, text: `${row.syncStatus === "FAILED" ? "Needs attention" : "Not yet sent"}: ${row.lastError}`, tone: row.syncStatus === "FAILED" ? ("bad" as const) : ("warn" as const) }] : []),
    ...(row.erpStatusAt && row.erpStatus ? [{ at: row.erpStatusAt, text: `ERP status last read: ${row.erpStatus.charAt(0)}${row.erpStatus.slice(1).toLowerCase()}`, tone: "info" as const }] : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const dot = { ok: "bg-success", warn: "bg-warn", bad: "bg-danger", info: "bg-info" } as const;

  return (
    <>
      <PageHeader
        title={row.externalRef}
        subtitle={`Placed ${when(row.createdAt)} · Source: Online Store`}
        actions={
          <>
            <CopyButton value={row.externalRef} label="order number" />
            <SyncBadge status={row.syncStatus} />
            <ErpBadge status={live ? live.status : row.erpStatus} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items" id="items">
            <ul className="divide-y divide-border text-sm">
              {items.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                  <span className="flex min-w-0 items-center gap-3">
                    {l.image && <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface"><Image src={l.image} alt="" fill sizes="48px" className="object-contain p-1" /></span>}
                    <span className="min-w-0">{l.name}{l.variantLabel ? ` (${l.variantLabel})` : ""} <span className="text-muted">× {l.quantity}</span></span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatLkr(Number(row.subtotal))}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{formatLkr(Number(row.deliveryCharge))}</dd></div>
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatLkr(Number(row.total))}</dd></div>
            </dl>
            <PriceAudit value={row.priceBreakdown} />
          </Panel>

          <Panel title="Customer and delivery" id="customer">
            <Facts
              rows={[
                { k: "Name", v: row.customerName },
                { k: "Phone", v: row.customerPhone },
                ...(row.customerEmail ? [{ k: "Email", v: row.customerEmail }] : []),
                { k: "Address", v: `${payload.delivery.addressLine1}, ${payload.delivery.city}, ${payload.delivery.district}${payload.delivery.postalCode ? ` ${payload.delivery.postalCode}` : ""}` },
                ...(payload.delivery.notes ? [{ k: "Notes", v: payload.delivery.notes }] : []),
                { k: "Account", v: row.customerId ? "Signed-in customer" : "Guest checkout" },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Status and payment" id="status">
            <Facts
              rows={[
                { k: "ERP status", v: <><ErpBadge status={live ? live.status : row.erpStatus} />{!live && row.erpStatus && <span className="ml-2 text-xs font-normal text-muted">(last known)</span>}</> },
                { k: "Payment", v: live ? (live.codCollected ? "COD: cash collected" : paymentLabel({ ...row, erpPaymentStatus: "COD_PENDING" })) : paymentLabel(row) },
                {
                  k: "Tracking",
                  v: tracking ? (
                    <span className="inline-flex items-center gap-1"><span className="font-mono">{tracking}</span><CopyButton value={tracking} label="tracking number" />{carrier && <span className="font-normal text-muted">({carrier})</span>}</span>
                  ) : (
                    <span className="font-normal text-muted">Not dispatched yet</span>
                  ),
                },
              ]}
            />
          </Panel>

          <Panel title="ERP synchronisation" id="sync">
            <Facts
              rows={[
                { k: "Sync status", v: <SyncBadge status={row.syncStatus} /> },
                { k: "Attempts", v: row.syncAttempts, testId: "attempts" },
                { k: "In ERP since", v: when(row.syncedAt) },
                ...(row.syncStatus === "PENDING" ? [{ k: "Next retry", v: when(row.nextAttemptAt) }] : []),
                ...(row.lastError ? [{ k: "Last error", v: <span className="text-danger">{row.lastError} <span className="text-muted">({row.lastErrorCode})</span></span>, testId: "last-error" }] : []),
              ]}
            />
            {row.syncStatus !== "SYNCED" && (
              <div className="mt-5 border-t border-border pt-4">
                <RetryButton orderRef={row.externalRef} />
                <p className="mt-2 text-xs text-muted">Sending again is safe: the ERP recognises the order reference and never creates a second order.</p>
              </div>
            )}
          </Panel>

          <Panel title="Timeline" id="timeline">
            <ol className="space-y-4">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[e.tone]}`} aria-hidden />
                  <div className="min-w-0"><p className="break-words">{e.text}</p><p className="text-xs text-muted">{when(e.at)}</p></div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}

function PriceAudit({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const v = value as { catalogueSavings?: number; advertised?: { name: string; discount: number }[]; blocked?: { name: string; reason: string }[] };
  const advertised = Array.isArray(v.advertised) ? v.advertised : [];
  const blocked = Array.isArray(v.blocked) ? v.blocked : [];
  if (!advertised.length && !blocked.length && !(typeof v.catalogueSavings === "number" && v.catalogueSavings > 0)) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
      {typeof v.catalogueSavings === "number" && v.catalogueSavings > 0 && <p>Catalogue savings included: {formatLkr(v.catalogueSavings)}. The total charged is still the HEXALYTE total.</p>}
      {advertised.map((p) => <p key={p.name}>Offer “{p.name}” matches that saving ({formatLkr(p.discount)}).</p>)}
      {blocked.map((p) => <p key={p.name} className="text-muted">{p.name}: {p.reason}</p>)}
    </div>
  );
}
