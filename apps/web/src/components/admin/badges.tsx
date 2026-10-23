import type { SyncStatus } from "@/generated/prisma/client";

const SYNC: Record<SyncStatus, { label: string; cls: string }> = {
  SYNCED: { label: "In ERP", cls: "bg-success-bg text-success" },
  PENDING: { label: "Waiting for ERP", cls: "bg-warn-bg text-warn" },
  FAILED: { label: "Needs attention", cls: "bg-danger-bg text-danger" },
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  const s = SYNC[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

const ERP: Record<string, string> = { PLACED: "Placed", CONFIRMED: "Confirmed", DISPATCHED: "Dispatched", DELIVERED: "Delivered", CANCELLED: "Cancelled" };

export function ErpBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">-</span>;
  return <span className={`badge ${status === "CANCELLED" ? "bg-surface text-muted" : status === "DELIVERED" ? "bg-success-bg text-success" : "bg-brand-50 text-brand-700"}`}>{ERP[status] ?? status}</span>;
}

/** Payment state of an order. COD cash only counts as collected when the ERP says so. */
export function PaymentBadge({ row }: { row: { paymentMethod: string; erpPaymentStatus: string | null; syncStatus: SyncStatus; erpStatus: string | null } }) {
  if (row.paymentMethod !== "COD") return <span className="badge bg-surface text-muted">{row.paymentMethod}</span>;
  if (row.erpStatus === "CANCELLED") return <span className="badge bg-surface text-muted">Cancelled</span>;
  if (row.erpPaymentStatus === "COD_COLLECTED") return <span className="badge bg-success-bg text-success">Cash collected</span>;
  if (row.syncStatus === "SYNCED") return <span className="badge bg-warn-bg text-warn">To collect</span>;
  return <span className="badge bg-surface text-muted">Not yet in ERP</span>;
}
