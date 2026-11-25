import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, Headset, Mail, MapPin, MessageCircle, Phone, Truck, Wallet, Zap } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import type { HomeData } from "@/lib/home-data";
import { siteConfig } from "@/lib/site-config";
import { categoryVisual } from "./category-art";
import { ProductCarousel } from "./product-carousel";
import { Reveal } from "./reveal";

type Cat = HomeData["categories"][number];

/** Two side-by-side promo banners built from real categories: chargers and smart watches first, else the largest others. */
export function PromoPair({ categories }: { categories: HomeData["categories"] }) {
  const picks: Cat[] = [];
  for (const re of [/charg|cable/i, /watch|wear/i]) {
    const c = categories.find((x) => re.test(x.name) && !picks.includes(x));
    if (c) picks.push(c);
  }
  for (const c of categories) {
    if (picks.length >= 2) break;
    if (!picks.includes(c)) picks.push(c);
  }
  if (picks.length < 2) return null;
  return (
    <section aria-label="Featured collections" className="container-page mt-10 sm:mt-14">
      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        {picks.slice(0, 2).map((c, i) => {
          const art = c.image ?? categoryVisual(c.name);
          return (
            <li key={c.slug}>
              <Link href={`/categories/${c.slug}`} className={`group on-dark grid h-full min-h-52 grid-cols-[1.1fr_1fr] items-center overflow-hidden rounded-2xl transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgb(0_0_0/0.5)] ${i === 0 ? "bg-ink text-white" : "bg-brand-500 text-on-brand"}`}>
                <span className="p-6 sm:p-8">
                  <span className={`block text-xs font-semibold uppercase tracking-[0.1em] ${i === 0 ? "text-brand-400" : "text-black/60"}`}>Collection</span>
                  <span className="mt-2 block text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{c.name}</span>
                  <span className={`mt-5 inline-flex min-h-10 items-center gap-1 rounded-full px-5 text-sm font-semibold transition-colors ${i === 0 ? "bg-brand-500 text-on-brand group-hover:bg-brand-400" : "bg-ink text-white group-hover:bg-black"}`}>Shop now <span aria-hidden>→</span></span>
                </span>
                <span className="relative m-3 h-[calc(100%-1.5rem)] min-h-40 overflow-hidden rounded-xl bg-white">
                  {art ? (
                    <Image src={art} alt={c.name} width={320} height={240} loading="lazy" sizes="(min-width:640px) 22vw, 40vw" className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <span aria-hidden className="flex h-full items-center justify-center"><Zap className="h-14 w-14 text-brand-500/40" strokeWidth={1} /></span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Featured brands: a bordered grid. A brand shows its uploaded logo (grayscale, colour on hover) or, without one, its name. */
export function BrandLogos({ brands }: { brands: HomeData["brands"] }) {
  const list = brands.filter((b) => b.count > 0).slice(0, 40);
  if (list.length < 2) return null;
  return (
    <section id="brands" aria-labelledby="brands-title" className="container-page mt-10 scroll-mt-40 sm:mt-14">
      <div className="mb-6 text-center sm:mb-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-brand-600">Brands at VOLTA.LK</p>
        <h2 id="brands-title" className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem]">Featured Brands</h2>
      </div>
      {/* Every brand sits in one row you can move by hand: swipe, trackpad, arrows or the dots. */}
      <ProductCarousel label="Brands" align="start" step="item" snap="proximity">
        {list.map((b) => (
          <li key={b.name} className="w-1/2 shrink-0 snap-start px-1.5 sm:w-1/3 md:w-1/4 lg:w-1/5">
            <Link href={`/products?brand=${encodeURIComponent(b.name)}`} aria-label={`${b.name}, ${b.count} ${b.count === 1 ? "product" : "products"}`} className="group flex h-24 items-center justify-center rounded-2xl border border-border bg-white p-5 transition-colors hover:border-ink hover:bg-surface sm:h-28">
              {b.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded logo served by our own route
                <img src={b.logo} alt={`${b.name} logo`} width={140} height={56} loading="lazy" className="max-h-12 w-auto max-w-full object-contain grayscale transition duration-200 group-hover:grayscale-0" />
              ) : (
                <span className="truncate text-lg font-semibold tracking-tight text-ink/70 transition-colors group-hover:text-ink">{b.name}</span>
              )}
            </Link>
          </li>
        ))}
      </ProductCarousel>
      <div className="mt-2 flex justify-center">
        <Link href="/brands" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white">
          View all brands <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** "Why choose VOLTA.LK": four cards. Only things the store really does; cash on delivery shows only when the ERP offers it. */
export function WhyChoose({ cod }: { cod: boolean }) {
  const items = [
    { icon: BadgeCheck, title: "Genuine Products", text: "Authentic phones, chargers and accessories from the brands we sell." },
    cod ? { icon: Wallet, title: "Cash on Delivery", text: "Check your order when it arrives, then pay. No card needed." } : null,
    { icon: Truck, title: "Island-wide Delivery", text: "We deliver across Sri Lanka, and you can track every order online." },
    { icon: Headset, title: "Friendly Support", text: "Questions about an order or a product? Call, message us on WhatsApp or write to us." },
  ].filter(Boolean) as { icon: typeof Phone; title: string; text: string }[];
  return (
    <section id="why" aria-labelledby="why-title" className="container-page mt-10 scroll-mt-40 sm:mt-14">
      <h2 id="why-title" className="mb-6 text-center text-2xl font-semibold tracking-tight text-ink sm:mb-8 sm:text-[2rem]">Why Choose {BRAND_NAME}</h2>
      <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {items.map(({ icon: Icon, title, text }, i) => (
          <Reveal as="li" key={title} delay={i * 80}>
            <div className="group flex h-full flex-col items-center rounded-2xl bg-surface p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_40px_-26px_rgba(17,17,17,0.5)] hover:ring-1 hover:ring-border motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-border transition-colors duration-300 group-hover:bg-brand-500 group-hover:text-on-brand group-hover:ring-brand-500">
                <Icon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold leading-snug text-ink">{title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-muted">{text}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/** Store address and contact details. Only configured details are shown; hidden when there are none. */
export function ContactBlock() {
  const phone = siteConfig.phone;
  const rows = [
    siteConfig.address && { icon: MapPin, label: "Visit us", text: siteConfig.address },
    phone && { icon: Phone, label: "Hotline", text: phone, href: `tel:${phone.replace(/\s/g, "")}` },
    siteConfig.email && { icon: Mail, label: "Email", text: siteConfig.email, href: `mailto:${siteConfig.email}` },
    siteConfig.hours.length > 0 && { icon: Clock, label: "Open", text: siteConfig.hours.join(" · ") },
  ].filter(Boolean) as { icon: typeof Phone; label: string; text: string; href?: string }[];
  // One line (usually just the hotline, which the footer already shows) is not worth a section.
  if (rows.length < 2) return null;
  return (
    <section aria-label="Contact" className="container-page mt-10 sm:mt-14">
      <ul className="grid gap-4 rounded-2xl border border-border p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        {rows.map(({ icon: Icon, label, text, href }) => (
          <li key={label} className="flex items-start gap-3 text-[15px]">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] text-muted">{label}</span>
              {href ? <a href={href} className="break-words font-medium text-ink hover:text-brand-600 hover:underline">{text}</a> : <span className="break-words font-medium text-ink">{text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Closing strip: join the store's WhatsApp for new arrivals and offers. */
export function JoinStrip() {
  const digits = siteConfig.whatsapp.replace(/\D/g, "");
  if (!digits) return null;
  return (
    <section aria-label="Join on WhatsApp" className="container-page mt-10 sm:mt-14">
      <div className="on-dark relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:p-10">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <Zap className="h-5 w-5 fill-brand-500 text-brand-500" aria-hidden /> Get new arrivals and offers first
          </p>
          <p className="mt-1 text-[15px] text-white/75">Join {BRAND_NAME} on WhatsApp.</p>
        </div>
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-lg relative shrink-0">
          <MessageCircle className="h-4 w-4" aria-hidden /> Join on WhatsApp
        </a>
      </div>
    </section>
  );
}
