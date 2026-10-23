import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Clock, CreditCard, Hourglass } from "lucide-react";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getSettings } from "@/lib/erp/settings";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const denied = await adminGate("/admin/payments");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;

  const live = { NOT: { erpStatus: "CANCELLED" } };
  const [collected, toCollect, unsent, settings] = await Promise.all([
    db.webOrder.aggregate({ where: { ...live, erpPaymentStatus: "COD_COLLECTED" }, _sum: { total: true }, _count: { _all: true } }),
    db.webOrder.aggregate({ where: { ...live, syncStatus: "SYNCED", NOT: [{ erpStatus: "CANCELLED" }, { erpPaymentStatus: "COD_COLLECTED" }] }, _sum: { total: true }, _count: { _all: true } }),
    db.webOrder.aggregate({ where: { syncStatus: { not: "SYNCED" } }, _sum: { total: true }, _count: { _all: true } }),
    getSettings().catch(() => null),
  ]);
  const n = (v: unknown) => formatLkr(Number(v ?? 0));

  return (
    <>
      <PageHeader title="Payments" subtitle="Cash on delivery is the only payment method. The ERP records when cash is collected; this page only reflects it." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Banknote} tone="green" label="COD collected" value={n(collected._sum.total)} sub={`${collected._count._all} orders`} />
        <Stat icon={Clock} tone="orange" label="COD to collect" value={n(toCollect._sum.total)} sub={`${toCollect._count._all} orders in the ERP`} />
        <Stat icon={Hourglass} tone="red" label="Not yet in ERP" value={n(unsent._sum.total)} sub={`${unsent._count._all} orders waiting`} href="/admin/erp/orders" />
        <Stat icon={CreditCard} tone="grey" label="Online payments" value="Off" sub="no gateway connected" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Methods enabled in the ERP" id="methods">
          {settings ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>Cash on delivery</span><span className={`badge ${settings.paymentMethods.COD ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>{settings.paymentMethods.COD ? "Enabled" : "Disabled"}</span></li>
              <li className="flex justify-between"><span>Online payment</span><span className="badge bg-surface text-muted">{settings.paymentMethods.ONLINE ? "Enabled in ERP, not available on this website" : "Disabled"}</span></li>
            </ul>
          ) : (
            <p className="text-sm text-muted">The ERP settings could not be read right now.</p>
          )}
        </Panel>
        <Panel title="Details" id="details">
          <p className="text-sm text-muted">See every order with its payment status on <Link href="/admin/payments/transactions" className="font-semibold text-brand-600 hover:underline">Transactions</Link>. Refunds and online gateway settlements do not exist yet because no gateway is connected.</p>
        </Panel>
      </div>
    </>
  );
}
