import type { Metadata } from "next";
import { SeasonSwitch } from "@/components/admin/season-switch";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getSeasonSettings } from "@/lib/season";

export const metadata: Metadata = { title: "Seasonal Theme" };
export const dynamic = "force-dynamic";

export default async function SeasonalThemePage() {
  const denied = await adminGate("/admin/marketing/theme");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const settings = await getSeasonSettings();

  return (
    <>
      <PageHeader title="Seasonal Theme" subtitle="Decorate the store for a season. Prices, stock and checkout do not change." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Halloween" id="halloween">
          <SeasonSwitch initial={settings} />
        </Panel>
        <Panel title="What changes" id="changes">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>The O in the VOLTA.LK logo becomes a pumpkin.</li>
            <li>The top bar shows the Halloween line.</li>
            <li>A cobweb with a spider and a few bats sit under the header.</li>
          </ul>
          <p className="mt-3 text-sm text-muted">Turning it off puts everything back. Open stores update within about 15 seconds.</p>
        </Panel>
      </div>
    </>
  );
}
