import Link from "next/link";
import { ArrowRight, Banknote, PackageSearch, Plus, RefreshCw, Truck } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { Reveal } from "./reveal";

/**
 * "Why shop with VALTA.LK": only things the store really does (checkout rules come from the live ERP settings).
 * No warranty, authorised-dealer, payment-provider or speed promises, because none are verified.
 */
export function WhyChoose({ checkout }: { checkout: HomeData["checkout"] }) {
  const reasons = [
    ...(checkout.cod ? [{ icon: Banknote, title: "Cash on delivery", text: "Pay with cash when your order arrives. No card is needed to order." }] : []),
    ...(checkout.deliveryCharge != null ? [{ icon: Truck, title: "Clear delivery charge", text: `A flat delivery charge of ${formatLkr(checkout.deliveryCharge)} is shown before you place your order.` }] : []),
    { icon: RefreshCw, title: "Live prices and stock", text: "Prices and availability come from our live catalogue and are checked again when you place your order." },
    { icon: PackageSearch, title: "Track and cancel online", text: "Follow your order with its reference number, and cancel it online before it is dispatched." },
  ];
  return (
    // A warm light panel sets the trust points apart from the white page; neon orange is only the icon signal and glow.
    <section aria-labelledby="why" className="section-space relative overflow-hidden rounded-[1.75rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-bg to-surface px-4 py-5 sm:px-6 sm:py-6">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 animate-drift rounded-full bg-brand-500/15 blur-3xl" />
      <Reveal className="relative mb-4 max-w-2xl border-l-[3px] border-brand-500 pl-3">
        <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">Why VALTA</p>
        <h2 id="why" className="section-title">Why shop with VALTA.LK</h2>
      </Reveal>
      <ul className="relative grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {reasons.map(({ icon: I, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 80} className="h-full">
            <div className="flex h-full flex-col bg-bg p-3 transition-colors duration-300 hover:bg-brand-50 sm:p-4">
              <span className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-on-brand sm:h-9 sm:w-9">
                  <I className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span aria-hidden className="type-mono text-muted/60">0{i + 1}</span>
              </span>
              <h3 className="mt-2.5 text-[13px] font-semibold leading-snug sm:text-sm">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

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
    <section aria-labelledby="faq" className="section-space">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr] lg:gap-10">
        <Reveal className="lg:sticky lg:top-40 lg:self-start">
          <div className="border-l-[3px] border-brand-500 pl-3">
          <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">FAQ</p>
          <h2 id="faq" className="section-title">
            Questions, answered
          </h2>
          </div>
          <p className="type-meta mt-3 max-w-sm">Quick answers about paying, delivery, stock, tracking and returns.</p>
          <p className="mt-5 text-sm text-muted">Need something else?</p>
          <Link href="/contact" className="btn-secondary group mt-2">
            Contact us
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
          </Link>
        </Reveal>
        <div className="space-y-2">
          {items.map((i, n) => (
            <Reveal key={i.q} delay={n * 60}>
              <details className="group rounded-2xl border border-border bg-bg transition-[border-color,box-shadow] duration-200 open:border-ink/20 open:shadow-card hover:border-ink/25 motion-reduce:transition-none">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {i.q}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-200 group-open:bg-brand-500 group-open:text-on-brand">
                    <Plus className="h-4 w-4 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                  </span>
                </summary>
                <p className="max-w-2xl px-4 pb-4 text-[13px] leading-6 text-muted">{i.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
