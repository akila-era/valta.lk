import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Body } from "@/components/layout/info-content";
import { PolicyPage } from "@/components/layout/policy-page";
import { faqItems } from "@/components/home/more-sections";
import { getSettings } from "@/lib/erp/settings";
import { getInfoPage } from "@/lib/info-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getInfoPage("faq");
  return { title: content.title, description: "Answers about paying, delivery, stock, tracking and returns at VOLTA.LK.", alternates: { canonical: "/faq" } };
}

export default async function FaqPage() {
  const { content, custom } = await getInfoPage("faq");
  // Until the owner edits the FAQ, the questions come from the live ERP settings (delivery charge, cash on delivery).
  const settings = custom ? null : await getSettings().catch(() => null);
  const items = custom
    ? content.sections.map((s) => ({ q: s.heading, a: s.body }))
    : faqItems({ cod: settings?.paymentMethods.COD === true, deliveryCharge: settings ? settings.deliveryCharge : null }).map((i) => ({ q: i.q, a: i.a }));
  return (
    <PolicyPage title={content.title} intro={content.intro} layout="stack">
      <section>
        <div className="divide-y divide-border border-y border-border">
          {items.map((i) => (
            <details key={i.q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
                {i.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-200 group-open:bg-ink group-open:text-white">
                  <Plus className="h-4 w-4 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                </span>
              </summary>
              <div className="max-w-2xl space-y-3 pb-5 pr-12 text-sm leading-6">
                <Body text={i.a} />
              </div>
            </details>
          ))}
        </div>
      </section>
      <section>
        <h2>Still need help?</h2>
        <p>
          For an existing order, use the <Link className="font-medium text-brand-600 underline" href="/track-order">Track order</Link> page. For anything else, <Link className="font-medium text-brand-600 underline" href="/contact">contact us</Link>.
        </p>
      </section>
    </PolicyPage>
  );
}
