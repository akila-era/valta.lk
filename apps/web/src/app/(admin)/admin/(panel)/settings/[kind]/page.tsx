import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorNote, PageHeader, Panel } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { getSettings } from "@/lib/erp/settings";
import { erpHealth } from "@/lib/admin/stats";
import { ErpConnectionForm } from "@/components/admin/erp-connection-form";
import { connectionSource, encryptionConfigured, getActiveErpEnv } from "@/lib/erp/connection";
import { getDb } from "@/lib/db";
import { formatLkr } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = { payment: "Payment settings", shipping: "Shipping settings", erp: "ERP settings" };
type Props = { params: Promise<{ kind: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: TITLES[(await params).kind] ?? "Settings" };
}

const Row = ({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "bad" }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
    <dt className="text-muted">{k}</dt>
    <dd className={`text-right font-semibold ${tone === "ok" ? "text-success" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : ""}`}>{v}</dd>
  </div>
);

const ReadOnly = ({ where }: { where: string }) => (
  <p className="mt-4 rounded-lg bg-surface p-3 text-xs text-muted">Read-only. {where} Nothing on this page can be changed from the website, so there is no Save button.</p>
);

export default async function SettingsKindPage({ params }: Props) {
  const { kind } = await params;
  const title = TITLES[kind];
  if (!title) notFound();
  const denied = await adminGate(`/admin/settings/${kind}`);
  if (denied) return denied;

  const env = await getActiveErpEnv();
  const settings = env ? await getSettings({ fresh: true }).catch(() => null) : null;

  if (kind === "payment") {
    return (
      <>
        <PageHeader title={title} subtitle="Which payment methods customers can use at checkout." />
        {env && !settings && <ErrorNote>The ERP settings could not be read right now.</ErrorNote>}
        <Panel title="Methods" id="methods">
          <dl className="divide-y divide-border">
            <Row k="Cash on delivery" v={settings ? (settings.paymentMethods.COD ? "Enabled in the ERP" : "Disabled in the ERP") : "Unknown"} tone={settings?.paymentMethods.COD ? "ok" : "warn"} />
            <Row k="Online payment" v={settings?.paymentMethods.ONLINE ? "Enabled in ERP, not available on this website" : "Not available"} tone="warn" />
            <Row k="Payment gateway" v="Not connected" tone="bad" />
          </dl>
          <ReadOnly where="COD is switched in the ERP. An online gateway needs credentials and development before it can be offered." />
        </Panel>
      </>
    );
  }
  if (kind === "shipping") {
    return (
      <>
        <PageHeader title={title} subtitle="Delivery charge applied at checkout." />
        {env && !settings && <ErrorNote>The ERP settings could not be read right now.</ErrorNote>}
        <Panel title="Delivery" id="delivery">
          <dl className="divide-y divide-border">
            <Row k="Delivery charge (flat)" v={settings ? formatLkr(settings.deliveryCharge) : "Unknown"} />
            <Row k="Currency" v={settings?.currency ?? "Unknown"} />
            <Row k="Delivery zones / rates" v="Not supported by the ERP" tone="warn" />
          </dl>
          <ReadOnly where="The delivery charge is set in the ERP and applied to every order." />
        </Panel>
      </>
    );
  }
  const health = env ? await erpHealth() : null;
  let host = "-";
  try {
    host = env ? new URL(env.HX_API_BASE).host : "-";
  } catch {
    /* keep "-" */
  }
  const db = getDb();
  const source = await connectionSource();
  const stored = db && source === "admin" ? await db.erpConnectionConfig.findUnique({ where: { id: "default" }, select: { baseUrl: true, credentialHint: true } }).catch(() => null) : null;
  return (
    <>
      <PageHeader title={title} subtitle="Connect this website to a HEXALYTE ERP shop with its address and API credential. The credential stays on the server and is never displayed." />
      <div className="mb-6">
        <Panel title="Connect to the ERP" id="connect">
          <ErpConnectionForm source={source} base={stored?.baseUrl ?? null} hint={stored?.credentialHint ?? null} encryptionReady={encryptionConfigured()} dbReady={Boolean(db)} />
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Connection" id="conn">
          <dl className="divide-y divide-border">
            <Row k="Configured" v={env ? "Yes" : "No: connect an ERP below"} tone={env ? "ok" : "bad"} />
            <Row k="ERP host" v={host} />
            <Row k="Store credential" v={env ? "Set (hidden)" : "Not set"} tone={env ? "ok" : "bad"} />
            <Row k="Reachable now" v={health ? (health.reachable ? "Connected" : "Unreachable") : "-"} tone={health?.reachable ? "ok" : health ? "bad" : undefined} />
          </dl>
        </Panel>
        <Panel title="Store rules from the ERP" id="rules">
          <dl className="divide-y divide-border">
            <Row k="Accepting orders" v={settings ? (settings.ordersEnabled ? "Yes" : "Paused") : "-"} tone={settings?.ordersEnabled ? "ok" : "warn"} />
            <Row k="Stock reservations" v={settings ? (settings.reservationsEnabled ? "Enabled" : "Disabled") : "-"} />
            <Row k="Max lines per order" v={settings?.limits?.maxOrderLines ? String(settings.limits.maxOrderLines) : "-"} />
            <Row k="Max quantity per line" v={settings?.limits?.maxQuantityPerLine ? String(settings.limits.maxQuantityPerLine) : "-"} />
          </dl>
        </Panel>
      </div>
    </>
  );
}
