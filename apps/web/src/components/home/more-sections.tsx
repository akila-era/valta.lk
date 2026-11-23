import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { Reveal } from "./reveal";

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
    <section aria-labelledby="faq" className="mt-14 sm:mt-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
        <Reveal className="lg:sticky lg:top-40 lg:self-start">
          <h2 id="faq" className="section-title">
            Questions, answered
          </h2>
          <p className="type-meta mt-3 max-w-sm">Quick answers about paying, delivery, stock, tracking and returns.</p>
          <p className="mt-5 text-sm text-muted">Need something else?</p>
          <Link href="/contact" className="btn-secondary group mt-2">
            Contact us
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
          </Link>
        </Reveal>
        <div className="divide-y divide-border border-y border-border">
          {items.map((i, n) => (
            <Reveal key={i.q} delay={n * 60}>
              <details className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  {i.q}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-200 group-open:bg-ink group-open:text-white">
                    <Plus className="h-4 w-4 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                  </span>
                </summary>
                <p className="max-w-2xl pb-5 pr-12 text-sm leading-6 text-muted">{i.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
