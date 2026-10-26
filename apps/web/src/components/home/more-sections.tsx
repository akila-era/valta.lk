import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";

/** Answers describe only behaviour the site really has; money values come from live ERP settings. */
export function faqItems(checkout: HomeData["checkout"]): { q: string; a: string }[] {
  const noTimes = "We do not state delivery times on this website.";
  return [
    {
      q: "How do I pay?",
      a: checkout.cod
        ? "Payment is by cash on delivery. Your order is recorded as unpaid until the cash is collected when it is delivered."
        : "The payment options available are shown at checkout.",
    },
    {
      q: "How much is delivery?",
      a:
        checkout.deliveryCharge != null
          ? `The delivery charge is ${formatLkr(checkout.deliveryCharge)} and is shown before you place your order. ${noTimes}`
          : `The delivery charge is shown before you place your order. ${noTimes}`,
    },
    { q: "Is the stock guaranteed?", a: "Availability and prices are confirmed again when you place your order. If anything changed, you will be asked to review it first." },
    { q: "How do I track or cancel my order?", a: "Enter your order reference on the Track order page. You can cancel there until the order is dispatched; after that, please contact us." },
    { q: "What about returns?", a: "Returns are handled by our team and do not change the status shown online. Contact us to arrange one; refunds are not automatic." },
  ];
}

export function Faq({ checkout }: { checkout: HomeData["checkout"] }) {
  const items = faqItems(checkout);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <section aria-labelledby="faq-title" id="faq" className="scroll-mt-40">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <div>
          <p className="eyebrow mb-1">FAQ</p>
          <h2 id="faq-title" className="section-title">Questions, answered</h2>
          <p className="type-meta mt-2 max-w-sm">Quick answers about paying, delivery, stock, tracking and returns.</p>
          <Link href="/contact" className="btn-secondary mt-5">
            Contact us <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="divide-y divide-border rounded-panel border border-border bg-bg">
          {items.map((i) => (
            <details key={i.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                {i.q}
                <Plus className="h-4 w-4 shrink-0 text-brand-600 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
              </summary>
              <p className="max-w-2xl px-5 pb-5 text-sm leading-6 text-muted">{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
