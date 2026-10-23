import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminEmails } from "@/lib/admin/auth";
import { adminGate } from "@/lib/admin/gate";
import { getDb } from "@/lib/db";
import { getActiveErpEnv } from "@/lib/erp/connection";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const Row = ({ k, v, ok }: { k: string; v: string; ok?: boolean }) => (
  <div className="flex justify-between gap-4 py-2 text-sm">
    <dt className="text-muted">{k}</dt>
    <dd className={`text-right font-semibold ${ok === undefined ? "" : ok ? "text-success" : "text-warn"}`}>{v}</dd>
  </div>
);

export default async function SettingsPage() {
  const denied = await adminGate("/admin/settings");
  if (denied) return denied;
  const secret = process.env.ORDER_SYNC_SECRET ?? "";
  const erpEnv = await getActiveErpEnv();
  return (
    <>
      <PageHeader title="Settings" subtitle="Read-only view of how this deployment is configured. Nothing on this page is editable: values are server environment variables, and secrets are never displayed." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Store" id="store">
          <dl className="divide-y divide-border">
            <Row k="Site URL" v={siteConfig.url} />
            <Row k="Environment" v={process.env.NODE_ENV ?? "-"} />
          </dl>
        </Panel>
        <Panel title="Connections and integrations" id="conn">
          <dl className="divide-y divide-border">
            <Row k="ERP connection" v={erpEnv ? "Configured" : "Not configured"} ok={Boolean(erpEnv)} />
            <Row k="Website database" v={getDb() ? "Configured" : "Not configured"} ok={Boolean(getDb())} />
            <Row k="Admin emails" v={String(adminEmails().length)} ok={adminEmails().length > 0} />
            <Row k="Order sync scheduler" v={secret.length >= 16 ? "Enabled" : "Not enabled"} ok={secret.length >= 16} />
            <Row k="Online payment gateway" v="Not connected" ok={false} />
            <Row k="Email provider" v="Not connected" ok={false} />
          </dl>
        </Panel>
      </div>
    </>
  );
}
