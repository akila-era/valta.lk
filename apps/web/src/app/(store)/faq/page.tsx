import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PolicyPage } from "@/components/layout/policy-page";
import { faqItems } from "@/components/home/more-sections";
import { getSettings } from "@/lib/erp/settings";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about paying, delivery, stock, tracking and returns at VALTA.LK.",
  alternates: { canonical: "/faq" },
};
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const settings = await getSettings().catch(() => null);
  const items = faqItems({ cod: settings?.paymentMethods.COD === true, deliveryCharge: settings ? settings.deliveryCharge : null });
  return (
    <PolicyPage title="Frequently asked questions" intro="Quick answers about paying, delivery, stock, tracking and returns.">
      <section className="!border-t-0 !pt-0">
        <div className="divide-y divide-border border-y border-border">
          {items.map((i) => (
            <details key={i.q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
                {i.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-200 group-open:bg-ink group-open:text-white">
                  <Plus className="h-4 w-4 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                </span>
              </summary>
              <p className="max-w-2xl pb-5 pr-12 text-sm leading-6">{i.a}</p>
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
