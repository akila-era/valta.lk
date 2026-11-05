import type { Metadata } from "next";
import { Faq } from "@/components/home/more-sections";
import { getSettings } from "@/lib/erp/settings";

export const metadata: Metadata = { title: "Frequently asked questions", alternates: { canonical: "/faqs" } };

/** /faqs (as on ugreen.lk): the same questions as the homepage FAQ, edited in the admin (Content, FAQs). */
export default async function FaqsPage() {
  const s = await getSettings().catch(() => null);
  return <Faq page checkout={{ cod: s?.paymentMethods.COD === true, deliveryCharge: s?.deliveryCharge ?? null }} />;
}
