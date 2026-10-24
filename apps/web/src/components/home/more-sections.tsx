import Link from "next/link";
import { ArrowRight, Banknote, MessageCircleQuestion, PackageSearch, Plus, RefreshCw, Truck } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
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
    // Bento on a warm stage: white cards with a 3D icon tile, and a big outlined number as the 2D counterpoint.
    <section aria-labelledby="why" className="section-space relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,#fff4ec,#ffffff_45%,#f6f4f0)] px-4 py-6 ring-1 ring-inset ring-brand-500/10 sm:px-6 sm:py-8 lg:rounded-feature lg:px-8 lg:py-10">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-drift rounded-full bg-brand-500/15 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full border-[14px] border-brand-500/10" />
      <span aria-hidden className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(23_23_23/0.06)_1px,transparent_1.3px)] [background-size:18px_18px] [mask-image:linear-gradient(200deg,#000,transparent_60%)]" />
      <Reveal className="relative mb-5 max-w-2xl sm:mb-7">
        <p className="eyebrow mb-1.5">Why VALTA</p>
        <h2 id="why" className="section-title">Why shop with VALTA.LK</h2>
      </Reveal>
      <ul className="relative grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        {reasons.map(({ icon: I, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 100} className="h-full">
            <div className="group relative flex h-full flex-col overflow-hidden rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-ink/[0.05] backdrop-blur transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0 sm:p-6">
              <span aria-hidden className="pointer-events-none absolute right-4 top-2 font-display text-[4.5rem] font-black leading-none text-transparent [-webkit-text-stroke:1.5px_rgb(255_92_0/0.16)] transition-transform duration-500 group-hover:-translate-y-1">0{i + 1}</span>
              <Icon3D icon={I} size="lg" />
              <h3 className="relative mt-5 text-base font-bold leading-snug tracking-[-0.015em]">{title}</h3>
              <p className="relative mt-1.5 max-w-xs text-sm leading-6 text-muted">{text}</p>
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
        {/* A glass help card with a 3D icon; it stays in view beside the questions on wide screens. */}
        <Reveal className="lg:sticky lg:top-40 lg:self-start">
          <div className="group relative overflow-hidden rounded-panel bg-[linear-gradient(150deg,#fff4ec,#ffffff_60%)] p-6 shadow-soft ring-1 ring-brand-500/10 sm:p-7">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[12px] border-brand-500/10" />
            <Icon3D icon={MessageCircleQuestion} size="lg" />
            <p className="eyebrow mb-1.5 mt-5">FAQ</p>
            <h2 id="faq" className="section-title">
              Questions, answered
            </h2>
            <p className="type-meta mt-3 max-w-sm">Quick answers about paying, delivery, stock, tracking and returns.</p>
            <p className="mt-5 text-sm text-muted">Need something else?</p>
            <Link href="/contact" className="btn-secondary group/c mt-2 bg-white">
              Contact us
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/c:translate-x-1 motion-reduce:transition-none" aria-hidden />
            </Link>
          </div>
        </Reveal>
        <div className="space-y-3">
          {items.map((i, n) => (
            <Reveal key={i.q} delay={n * 60}>
              <details className="group rounded-card bg-white shadow-soft ring-1 ring-ink/[0.06] transition-[box-shadow,transform] duration-300 open:shadow-float open:ring-brand-500/25 hover:-translate-y-0.5 hover:shadow-float motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-3 text-[15px] font-semibold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3">
                    <span aria-hidden className="type-mono text-brand-600">0{n + 1}</span>
                    {i.q}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[inset_0_1px_0_#fff] ring-1 ring-ink/[0.06] transition-[background-color,color,box-shadow] duration-300 group-open:bg-brand-500 group-open:text-on-brand group-open:shadow-[0_8px_18px_-6px_rgb(255_92_0/0.6)]">
                    <Plus className="h-4 w-4 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                  </span>
                </summary>
                <p className="max-w-2xl px-5 pb-5 pl-[3.25rem] text-sm leading-6 text-muted">{i.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
