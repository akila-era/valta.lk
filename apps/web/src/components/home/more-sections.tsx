import Link from "next/link";
import { ArrowRight, Banknote, CircleHelp, Coins, Gem, PackageCheck, PackageSearch, Plus, RefreshCw, Search, ShoppingBag, Truck, Wallet } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { Reveal } from "./reveal";

export function BudgetShortcuts({ budget }: { budget: HomeData["budget"] }) {
  if (!budget) return null;
  const tiles = [
    { href: `/products?max=${budget.under}&sort=price-desc`, label: `Under ${formatLkr(budget.under)}`, hint: "Everyday essentials", icon: Coins },
    { href: `/products?min=${budget.under}&max=${budget.over}&sort=price-asc`, label: `${formatLkr(budget.under)} – ${formatLkr(budget.over)}`, hint: "Mid-range picks", icon: Wallet },
    { href: `/products?min=${budget.over}&sort=price-asc`, label: `Over ${formatLkr(budget.over)}`, hint: "Premium devices", icon: Gem },
  ];
  return (
    <section aria-labelledby="budget" className="mt-14 sm:mt-20">
      <Reveal className="mb-8 text-center">
        <h2 id="budget" className="section-title">Shop by budget</h2>
        <p className="type-meta mx-auto mt-2 max-w-md">Pick a price range and see what is available.</p>
      </Reveal>
      <ul className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <Reveal as="li" key={t.href} delay={i * 80}>
              <Link
                href={t.href}
                className="group relative flex h-full flex-col items-center overflow-hidden rounded-2xl border border-border bg-white px-6 pb-6 pt-7 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/60 hover:shadow-card motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-brand-500 transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none" />
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-ink">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t.hint}</span>
                <span className="mt-1.5 block text-xl font-bold tracking-tight sm:text-2xl">{t.label}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                  Browse <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

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
    <section aria-labelledby="why" className="mt-14 sm:mt-20">
      <Reveal className="mb-7 text-center sm:mb-9">
        <h2 id="why" className="section-title">Why shop with VALTA.LK</h2>
      </Reveal>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {reasons.map(({ icon: I, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 80} className="h-full">
            <div className="flex h-full flex-col items-center rounded-xl border border-border/60 bg-surface px-6 py-8 text-center">
              <I className="h-12 w-12 text-brand-600" strokeWidth={1.3} aria-hidden />
              <h3 className="mt-5 text-lg font-bold leading-snug">{title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-muted">{text}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function HowItWorks({ checkout }: { checkout: HomeData["checkout"] }) {
  const steps = [
    { icon: Search, title: "Find what you need", text: "Search or browse by category and compare prices in LKR." },
    {
      icon: ShoppingBag,
      title: "Place your order",
      text: checkout.cod ? "Enter your delivery details and choose cash on delivery. No card needed." : "Enter your delivery details and confirm your order at checkout.",
    },
    { icon: PackageCheck, title: "Track it online", text: "Use your order reference on the Track order page to follow the status. You can cancel before dispatch." },
  ];
  return (
    <section aria-labelledby="how" className="mt-14 sm:mt-20">
      <Reveal className="mb-8 text-center">
        <h2 id="how" className="section-title">How ordering works</h2>
        <p className="type-meta mx-auto mt-2 max-w-md">Three simple steps from browsing to your door.</p>
      </Reveal>
      <ol className="relative grid gap-4 md:grid-cols-3 md:gap-5">
        {/* Dotted line behind the step badges, desktop only */}
        <span aria-hidden className="absolute left-[16.7%] right-[16.7%] top-[3.35rem] hidden border-t-2 border-dashed border-brand-500/30 md:block" />
        {steps.map(({ icon: I, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 100} className="group relative flex flex-col items-center rounded-2xl border border-border bg-white px-6 pb-7 pt-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-card motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <span className="relative flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-brand-500 text-ink ring-8 ring-white">
              <I className="h-6 w-6" aria-hidden />
              <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white ring-2 ring-white" aria-hidden>
                {i + 1}
              </span>
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight">
              <span className="sr-only">Step {i + 1}: </span>
              {title}
            </h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted">{text}</p>
          </Reveal>
        ))}
      </ol>
      <p className="mt-6 text-center">
        <Link href="/track-order" className="btn-secondary group">
          Already ordered? Track your order
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
        </Link>
      </p>
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
    <section aria-labelledby="faq" className="mt-14 sm:mt-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
        <Reveal className="lg:sticky lg:top-40 lg:self-start">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <CircleHelp className="h-6 w-6" aria-hidden />
          </span>
          <h2 id="faq" className="section-title mt-4">
            Questions, answered
          </h2>
          <p className="type-meta mt-3 max-w-sm">Quick answers about paying, delivery, stock, tracking and returns.</p>
          <p className="mt-5 text-sm text-muted">Need something else?</p>
          <Link href="/contact" className="btn-secondary group mt-2">
            Contact us
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
          </Link>
        </Reveal>
        <div className="space-y-3">
          {items.map((i, n) => (
            <Reveal key={i.q} delay={n * 60}>
              <details className="group rounded-2xl border border-border bg-white shadow-sm transition-colors duration-200 open:border-brand-500/50 open:bg-brand-50/40 open:shadow-card hover:border-brand-500/40 motion-reduce:transition-none">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {i.q}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-colors duration-200 group-open:bg-brand-500">
                    <Plus className="h-4 w-4 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden />
                  </span>
                </summary>
                <p className="max-w-2xl px-5 pb-5 text-sm leading-6 text-muted">{i.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
