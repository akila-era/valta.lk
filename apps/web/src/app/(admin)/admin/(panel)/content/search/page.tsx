import type { Metadata } from "next";
import { ContentListEditor } from "@/components/admin/content-list-editor";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

/** Admin: the popular searches shown under the search box before the shopper types (as on ugreen.lk). */
export default async function SearchAdmin() {
  const denied = await adminGate("/admin/content/search");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const saved = await getContent("popular-searches");
  return (
    <>
      <PageHeader title="Search" subtitle="Popular searches shown when a shopper clicks the search box. Leave the list empty to show your biggest brands and categories instead." />
      <Panel title="Popular searches" id="popular">
        <ContentListEditor
          contentKey="popular-searches"
          isDefault={!saved}
          max={10}
          addLabel="Add search"
          initial={(saved?.items ?? []).map((x) => ({ label: x.label }))}
          fields={[{ key: "label", label: "Search words", hint: "e.g. Power bank, iPhone cable, 20000mAh" }]}
        />
      </Panel>
    </>
  );
}
