import type { Metadata } from "next";
import { ContentListEditor } from "@/components/admin/content-list-editor";
import { PageHeader, Panel } from "@/components/admin/ui";
import { faqItems } from "@/components/home/more-sections";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getSettings } from "@/lib/erp/settings";
import { getContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "FAQs" };
export const dynamic = "force-dynamic";

/** Admin: the questions on the homepage FAQ and the /faqs page. */
export default async function FaqsAdmin() {
  const denied = await adminGate("/admin/content/faqs");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const [saved, s] = await Promise.all([getContent("faq"), getSettings().catch(() => null)]);
  const items = saved?.items ?? faqItems({ cod: s?.paymentMethods.COD === true, deliveryCharge: s?.deliveryCharge ?? null });
  return (
    <>
      <PageHeader title="FAQs" subtitle="The questions and answers on the homepage and on the FAQs page (/faqs)." />
      <Panel title="Questions" id="faq">
        <ContentListEditor
          contentKey="faq"
          isDefault={!saved}
          max={30}
          addLabel="Add question"
          initial={items.map((i) => ({ q: i.q, a: i.a }))}
          fields={[
            { key: "q", label: "Question" },
            { key: "a", label: "Answer", type: "textarea" },
          ]}
        />
      </Panel>
    </>
  );
}
