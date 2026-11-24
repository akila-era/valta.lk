import type { Metadata } from "next";
import { StoreInfoForm } from "@/components/admin/store-info-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { DEMO_STORE_INFO, getStoreInfo } from "@/lib/store-info";

export const metadata: Metadata = { title: "Store Details" };
export const dynamic = "force-dynamic";

export default async function StoreDetailsPage() {
  const denied = await adminGate("/admin/settings/store");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const settings = await getStoreInfo();

  return (
    <>
      <PageHeader title="Store Details" subtitle="The top bar, contact details, opening hours, social links and payment badges shown on the store." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Details" id="details">
          <StoreInfoForm initial={settings} demo={DEMO_STORE_INFO} />
        </Panel>
        <Panel title="Where they show" id="where">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Top bar: the line, both phones and Store Locator.</li>
            <li>Footer: contact details, hours, social links and the Payment System badges.</li>
            <li>Contact page: phone, email and address.</li>
            <li>WhatsApp: the chat button on every page.</li>
          </ul>
          <p className="mt-3 text-sm text-muted">Products, prices and stock come from the ERP and are not changed here. Empty fields are hidden on the store.</p>
        </Panel>
      </div>
    </>
  );
}
