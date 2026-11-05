import type { Metadata } from "next";
import { PagesEditor } from "@/components/admin/pages-editor";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { BUILT_IN_PAGES, getContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "Pages" };
export const dynamic = "force-dynamic";

/** Admin: the site's text pages (About, policies, warranty, wholesale intro) and custom pages such as giveaway terms. */
export default async function PagesAdmin() {
  const denied = await adminGate("/admin/content/pages");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const saved = (await getContent("pages")) ?? {};
  const initial = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, { title: v.title, intro: v.intro, body: v.body, custom: v.custom }]));
  return (
    <>
      <PageHeader title="Pages" subtitle="Write the text of the About, policy, warranty and wholesale pages, or add your own pages (for example giveaway terms). A page keeps its built-in text until you save it here." />
      <Panel title="Edit a page" id="pages">
        <PagesEditor initial={initial} builtIn={BUILT_IN_PAGES} />
      </Panel>
    </>
  );
}
