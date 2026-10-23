import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { ErrorNote, Facts, PageHeader, Panel } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { catalogue, erpHealth } from "@/lib/admin/stats";
import { getActiveErpEnv } from "@/lib/erp/connection";

export const metadata: Metadata = { title: "ERP integration" };
export const dynamic = "force-dynamic";

const yes = (v: boolean | undefined, on = "Yes", off = "No") => (v === undefined ? "-" : v ? on : off);

export default async function ErpPage() {
  const denied = await adminGate("/admin/erp");
  if (denied) return denied;
  const configured = (await getActiveErpEnv()) !== null;
  const [health, cat] = await Promise.all([configured ? erpHealth() : null, configured ? catalogue() : null]);
  const s = health?.settings;

  const ok = Boolean(health?.reachable);
  const sections = [
    { href: "/admin/erp/products", title: "Product sync", text: "Catalogue copy: products, prices and images read from the ERP." },
    { href: "/admin/erp/inventory", title: "Inventory sync", text: "Stock levels read from the ERP, re-checked live at checkout." },
    { href: "/admin/erp/orders", title: "Order sync", text: "Orders sent to the ERP, retries and waiting orders." },
    { href: "/admin/erp/failed", title: "Failed sync jobs", text: "Orders the ERP rejected, with the reason and a safe retry." },
  ];

  return (
    <>
      <PageHeader title="ERP integration" subtitle="Live status of the connection to HEXALYTE ERP. Credentials are never shown here." actions={<Link href="/admin/settings/erp" className="btn-primary">Connect / change ERP</Link>} />
      {!configured && <ErrorNote>The ERP connection is not configured (HX_API_BASE / HX_STORE_CREDENTIAL are missing). Products and orders cannot work until it is set up.</ErrorNote>}
      {configured && health && !health.reachable && <ErrorNote>The ERP did not answer the connection check. Orders placed meanwhile are saved and sent when it is back.</ErrorNote>}

      <div className={`mb-6 flex items-center gap-4 rounded-xl border p-5 ${ok ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"}`} role="status">
        {ok ? <CheckCircle2 className="h-8 w-8 text-success" aria-hidden /> : <XCircle className="h-8 w-8 text-danger" aria-hidden />}
        <div>
          <p className={`text-lg font-bold ${ok ? "text-success" : "text-danger"}`}>{ok ? "Connected" : configured ? "Unreachable" : "Not configured"}</p>
          <p className="text-sm text-muted">{health ? `Checked just now (${health.checkedAt.toLocaleTimeString("en-LK")})` : "No check was made."}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Connection" id="conn">
          <Facts
            rows={[
              { k: "Configured", v: yes(configured) },
              { k: "Catalogue refreshed", v: cat ? cat.syncedAt.toLocaleTimeString("en-LK") : "-" },
              { k: "Products in catalogue", v: cat ? cat.products.length : "-" },
            ]}
          />
        </Panel>
        <Panel title="ERP store settings" id="settings">
          <Facts
            rows={[
              { k: "Accepting orders", v: yes(s?.ordersEnabled, "Yes", "Paused") },
              { k: "Cash on delivery", v: yes(s ? Boolean(s.paymentMethods.COD) : undefined, "Enabled", "Disabled") },
              { k: "Stock reservations", v: yes(s?.reservationsEnabled, "Enabled", "Disabled") },
              { k: "Currency", v: s?.currency ?? "-" },
            ]}
          />
        </Panel>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Synchronisation</h2>
      <nav aria-label="ERP sections" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((x) => (
          <Link key={x.href} href={x.href} className="card p-4 transition-colors hover:border-ink">
            <span className="font-semibold">{x.title} →</span>
            <span className="mt-1 block text-sm text-muted">{x.text}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
