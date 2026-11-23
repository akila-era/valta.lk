import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductImage } from "@/components/products/product-card";
import { effectivePrice } from "@/lib/erp/product-utils";
import type { ErpProduct } from "@/lib/erp/types";
import type { HomeData } from "@/lib/home-data";
import { formatLkr } from "@/lib/utils/money";
import { SectionIntro } from "./home-sections";
import { Reveal } from "./reveal";

const title = (p: ErpProduct) => p.content?.displayTitle || p.name;

/** Shop by budget: three fixed ranges, each shown with real, available products that genuinely fall inside it. */
export function BudgetShortcuts({ picks }: { picks: HomeData["budgetPicks"] }) {
  if (!picks.length) return null;
  const hints: Record<string, string> = { under: "Everyday essentials", mid: "Mid-range picks", over: "Premium devices" };
  return (
    <section aria-labelledby="budget" className="mt-16 sm:mt-24">
      <SectionIntro id="budget" eyebrow="Shop by budget" title="Start with what you want to spend.">
        Pick a price range and see what is available now.
      </SectionIntro>
      <ul className="-mx-4 flex scroll-px-4 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
        {picks.map((b, i) => {
          const dark = b.key === "over";
          const [lead, ...rest] = b.products;
          return (
            <Reveal as="li" key={b.key} delay={i * 80} className="w-[80%] shrink-0 snap-start min-[430px]:w-[68%] sm:w-[52%] md:w-auto">
              <Link
                href={b.href}
                className={`group flex h-full flex-col rounded-[1.75rem] p-3 transition-colors duration-300 motion-reduce:transition-none sm:p-5 ${dark ? "bg-ink text-white" : "bg-surface text-ink hover:bg-[#ececec]"}`}
              >
                <span className="relative block aspect-[16/11] overflow-hidden rounded-2xl bg-white md:aspect-[4/3]">
                  <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none">
                    <ProductImage src={lead.images[0]} alt="" sizes="(min-width:768px) 30vw, 90vw" padding="p-6 pr-[34%]" />
                  </span>
                  {rest.length > 0 && (
                    <span className="absolute bottom-3 right-3 top-3 flex w-[28%] flex-col gap-2">
                      {rest.slice(0, 2).map((p) => (
                        <span key={p.id} className="relative flex-1 overflow-hidden rounded-xl bg-surface">
                          <ProductImage src={p.images[0]} alt="" sizes="120px" padding="p-2" />
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className={`mt-4 text-xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/70" : "text-muted"}`}>{hints[b.key]}</span>
                <span className="mt-1 text-2xl font-bold leading-tight tracking-[-0.03em] sm:text-[1.75rem]">{b.label}</span>
                <span className={`mt-1 text-sm ${dark ? "text-white/70" : "text-muted"}`}>
                  {b.count} {b.count === 1 ? "product" : "products"} available &middot; e.g. {title(lead)}, {formatLkr(effectivePrice(lead))}
                </span>
                <span className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                  Shop this range
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
 * The VALTA experience: only things the store really does (checkout rules come from the live ERP settings).
 * No warranty, authorised-dealer, payment-provider or speed promises, because none are verified.
 */
export function WhyChoose({ checkout, photos }: { checkout: HomeData["checkout"]; photos: ErpProduct[] }) {
  const rows = [
    ...(checkout.cod ? [{ fig: "COD", title: "Cash on delivery", text: "Pay with cash when your order arrives. No card is needed to order." }] : []),
    ...(checkout.deliveryCharge != null ? [{ fig: formatLkr(checkout.deliveryCharge), title: "Clear delivery charge", text: `A flat delivery charge of ${formatLkr(checkout.deliveryCharge)} is shown before you place your order.` }] : []),
    { fig: "Live", title: "Live prices and stock", text: "Prices and availability come from our live catalogue and are checked again when you place your order." },
    { fig: "Online", title: "Track and cancel online", text: "Follow your order with its reference number, and cancel it online before it is dispatched." },
  ];
  const [a, b, c] = photos;
  return (
    <section aria-labelledby="why" className="mt-16 sm:mt-24">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal className="lg:sticky lg:top-40 lg:self-start">
          <p className="eyebrow mb-2">The VALTA experience</p>
          <h2 id="why" className="text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl lg:text-5xl">Why shop with VALTA.LK</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted sm:text-base">Simple, transparent shopping from the first search to the doorstep.</p>
          {a && (
            <div className="relative mt-8 hidden h-72 lg:block" aria-hidden>
              <span className="absolute left-0 top-0 h-60 w-52 overflow-hidden rounded-[1.5rem] bg-surface"><ProductImage src={a.images[0]} alt="" sizes="220px" padding="p-5" /></span>
              {b && <span className="absolute left-36 top-14 h-60 w-52 overflow-hidden rounded-[1.5rem] bg-surface ring-8 ring-white"><ProductImage src={b.images[0]} alt="" sizes="220px" padding="p-5" /></span>}
              {c && <span className="absolute left-72 top-28 h-44 w-40 overflow-hidden rounded-[1.5rem] bg-surface ring-8 ring-white"><ProductImage src={c.images[0]} alt="" sizes="160px" padding="p-4" /></span>}
            </div>
          )}
        </Reveal>
        <ul className="border-t border-ink">
          {rows.map((r, i) => (
            <Reveal as="li" key={r.title} delay={i * 70} className="grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-2 border-b border-border py-6 sm:py-8">
              <div>
                <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">{r.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted sm:text-base">{r.text}</p>
              </div>
              <span aria-hidden className="text-right text-2xl font-bold tracking-[-0.03em] text-brand-600 sm:text-4xl">{r.fig}</span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** How ordering works: a three-step visual journey using real catalogue photography. */
export function HowItWorks({ checkout, photos }: { checkout: HomeData["checkout"]; photos: ErpProduct[] }) {
  const steps = [
    { name: "Discover", text: "Explore products and brands." },
    { name: "Order", text: checkout.cod ? "Place your order at checkout. Cash on delivery is available." : "Place your order at checkout." },
    { name: "Receive", text: "Track your delivery online." },
  ];
  return (
    <section aria-labelledby="how" className="mt-16 sm:mt-24">
      <SectionIntro id="how" eyebrow="Three simple steps" title="How ordering works" />
      <ol className="grid gap-4 md:grid-cols-3 md:gap-5">
        {steps.map((s, i) => {
          const p = photos[i];
          return (
            <Reveal as="li" key={s.name} delay={i * 100} className={i === 1 ? "md:mt-10" : i === 2 ? "md:mt-20" : ""}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-surface md:aspect-[4/5]">
                {p && (
                  <span className="absolute inset-0">
                    <ProductImage src={p.images[0]} alt="" sizes="(min-width:768px) 30vw, 90vw" padding="p-10" />
                  </span>
                )}
                <span aria-hidden className="absolute left-5 top-4 text-6xl font-bold leading-none tracking-[-0.05em] text-ink/90 sm:text-7xl">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">
                <span className="sr-only">Step {i + 1}: </span>
                {s.name}
              </h3>
              <p className="mt-1 max-w-xs text-sm leading-6 text-muted">{s.text}</p>
            </Reveal>
          );
        })}
      </ol>
      <p className="mt-8">
        <Link href="/track-order" className="btn-secondary group">
          Already ordered? Track your order
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
        </Link>
      </p>
    </section>
  );
}

/** Final discovery prompt: simple, with the real catalogue size. */
export function FinalCta({ total }: { total: number }) {
  return (
    <section aria-labelledby="final-cta" className="mt-16 sm:mt-24">
      <Reveal className="rounded-[2rem] bg-ink px-6 py-12 text-white sm:px-12 sm:py-20 lg:px-20">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">VALTA.LK</p>
        <h2 id="final-cta" className="mt-3 max-w-3xl text-4xl font-bold leading-[1] tracking-[-0.04em] sm:text-6xl lg:text-7xl">Find your next favourite.</h2>
        <p className="mt-5 max-w-md text-base leading-7 text-white/70">
          {total > 0 ? `Browse ${total} ${total === 1 ? "product" : "products"} in the catalogue, with live prices and stock.` : "Browse the catalogue, with live prices and stock."}
        </p>
        <div className="mt-8 flex flex-col gap-3 min-[430px]:flex-row">
          <Link href="/products" className="btn-primary btn-lg rounded-full">
            Explore Products <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/track-order" className="btn btn-lg rounded-full border border-white/30 text-white hover:bg-white/10">Track an order</Link>
        </div>
      </Reveal>
    </section>
  );
}
