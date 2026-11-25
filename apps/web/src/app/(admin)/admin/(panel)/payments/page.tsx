import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Clock, CreditCard, Hourglass } from "lucide-react";
import { KokoConnectionForm } from "@/components/admin/koko-connection-form";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { encryptionConfigured } from "@/lib/erp/connection";
import { getSettings } from "@/lib/erp/settings";
import { PayzyAttemptActions } from "@/components/admin/payzy-attempt-actions";
import { PayzyConnectionForm } from "@/components/admin/payzy-connection-form";
import { getActivePayzy, payzyEnvironmentOf, payzySource } from "@/lib/payments/payzy-config";
import { listStalePayzyAttempts } from "@/lib/payments/payzy-service";
import { environmentOf, getActiveKoko, kokoSource } from "@/lib/payments/koko-config";
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
  const [kokoRow, source, active] = await Promise.all([db.kokoConnectionConfig.findUnique({ where: { id: "default" } }), kokoSource(), getActiveKoko()]);
  const kokoOn = Boolean(active.cfg) && active.enabled;
  const [payzyRow, payzySrc, payzyActive, stalePayzy, recentPayzy] = await Promise.all([
    db.payzyConnectionConfig.findUnique({ where: { id: "default" } }),
    payzySource(),
    getActivePayzy(),
    listStalePayzyAttempts(db).catch(() => []),
    db.payzyPayment.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { payzyOrderId: true, orderRef: true, amount: true, status: true, responseCode: true, createdAt: true } }),
  ]);
  const payzyOn = Boolean(payzyActive.cfg) && payzyActive.enabled;
  const n = (v: unknown) => formatLkr(Number(v ?? 0));

  return (
    <>
      <PageHeader title="Payments" subtitle="Cash on delivery (the ERP records when cash is collected) and Koko Buy Now Pay Later, which you connect below." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Banknote} tone="green" label="COD collected" value={n(collected._sum.total)} sub={`${collected._count._all} orders`} />
        <Stat icon={Clock} tone="orange" label="COD to collect" value={n(toCollect._sum.total)} sub={`${toCollect._count._all} orders in the ERP`} />
        <Stat icon={Hourglass} tone="red" label="Not yet in ERP" value={n(unsent._sum.total)} sub={`${unsent._count._all} orders waiting`} href="/admin/erp/orders" />
        <Stat icon={CreditCard} tone={kokoOn ? "green" : "grey"} label="Koko" value={kokoOn ? "On" : "Off"} sub={kokoOn ? "shown at checkout" : "not shown at checkout"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Methods enabled in the ERP" id="methods">
          {settings ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>Cash on delivery</span><span className={`badge ${settings.paymentMethods.COD ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>{settings.paymentMethods.COD ? "Enabled" : "Disabled"}</span></li>
              <li className="flex justify-between"><span>Online payment</span><span className={`badge ${settings.paymentMethods.ONLINE ? "bg-success-bg text-success" : "bg-surface text-muted"}`}>{settings.paymentMethods.ONLINE ? "Enabled" : "Disabled (Koko needs this on)"}</span></li>
            </ul>
          ) : (
            <p className="text-sm text-muted">The ERP settings could not be read right now.</p>
          )}
        </Panel>
        <Panel title="Details" id="details">
          <p className="text-sm text-muted">See every order with its payment status on <Link href="/admin/payments/transactions" className="font-semibold text-brand-600 hover:underline">Transactions</Link>. Koko payments are confirmed by Koko itself; refunds are done with Koko.</p>
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Payzy: instalments" id="payzy">
          <PayzyConnectionForm
            source={payzySrc}
            saved={payzyRow ? { environment: payzyEnvironmentOf(payzyRow.baseUrl), shopId: payzyRow.shopId, secretKeyHint: payzyRow.secretKeyHint, testMode: payzyRow.testMode, appUrl: payzyRow.appUrl, legacyVersionSigning: payzyRow.legacyVersionSigning, enabled: payzyRow.enabled } : null}
            encryptionReady={encryptionConfigured()}
            dbReady
            defaultAppUrl={process.env.APP_URL || process.env.SITE_URL || ""}
          />
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Payzy attempts {payzyOn ? "" : "(Payzy is currently off at checkout)"}</h3>
            <p className="mt-1 text-xs text-muted">Payzy only confirms by redirecting the customer back, so a customer who pays and closes the tab leaves the attempt PENDING. Attempts pending for over 30 minutes are highlighted: check each in the Payzy merchant portal, then mark it paid or failed.</p>
            {recentPayzy.length ? (
              <ul className="mt-3 space-y-2 text-sm" data-testid="payzy-attempts">
                {recentPayzy.map((a) => {
                  const stale = stalePayzy.some((x) => x.payzyOrderId === a.payzyOrderId);
                  return (
                    <li key={a.payzyOrderId} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${stale ? "bg-warn-bg text-warn" : "bg-surface"}`}>
                      <Link href={`/admin/orders/${a.orderRef}`} className="font-mono text-xs font-semibold underline">{a.payzyOrderId}</Link>
                      <span>{n(a.amount)} · {a.status}{a.responseCode ? ` (${a.responseCode})` : ""} · {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                      {a.status === "PENDING" && <PayzyAttemptActions payzyOrderId={a.payzyOrderId} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No Payzy attempts yet.</p>
            )}
          </div>
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Koko: Buy Now Pay Later" id="koko">
          <KokoConnectionForm
            source={source}
            saved={kokoRow ? { environment: environmentOf(kokoRow.baseUrl), merchantId: kokoRow.merchantId, apiKeyHint: kokoRow.apiKeyHint, pluginName: kokoRow.pluginName, pluginVersion: kokoRow.pluginVersion, appUrl: kokoRow.appUrl, enabled: kokoRow.enabled } : null}
            encryptionReady={encryptionConfigured()}
            dbReady
            defaultAppUrl={process.env.APP_URL || process.env.SITE_URL || ""}
          />
        </Panel>
      </div>
    </>
  );
}
