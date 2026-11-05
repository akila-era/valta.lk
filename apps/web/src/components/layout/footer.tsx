import { NewsletterForm } from "./newsletter-form";
import Link from "next/link";
import {
  Banknote, Building2, Handshake, Map as MapIcon, ChevronRight, Clock, FileText, Headset, HelpCircle, Mail, MapPin, MessageSquare, PackageSearch, Phone, RefreshCw, Share2, ShieldCheck, Truck,
  type LucideIcon,
} from "lucide-react";
import { listProducts } from "@/lib/erp/catalogue";
import { getCheckoutAvailability } from "@/lib/erp/settings";
import { formatLkr } from "@/lib/utils/money";
import { PAYMENT_BADGES, getStoreInfo, socialFrom, telHref } from "@/lib/store-info";
import { siteConfig } from "@/lib/site-config";
import { BackToTop } from "./back-to-top";
import { HalloweenSkyline } from "./halloween";
import { Wordmark } from "./wordmark";

const support: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/track-order", label: "Track your order", icon: PackageSearch },
  { href: "/contact", label: "Contact us", icon: MessageSquare },
  { href: "/shipping-policy", label: "Shipping policy", icon: Truck },
  { href: "/returns-policy", label: "Returns policy", icon: RefreshCw },
  { href: "/faqs", label: "Frequently asked questions", icon: HelpCircle },
  { href: "/wholesale", label: "Apply for wholesale", icon: Handshake },
];
const company: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/about", label: "About us", icon: Building2 },
  { href: "/privacy-policy", label: "Privacy policy", icon: ShieldCheck },
  { href: "/terms", label: "Terms & conditions", icon: FileText },
  { href: "/warranty-policy", label: "Warranty & refund policy", icon: ShieldCheck },
  { href: "/site-map", label: "Sitemap", icon: MapIcon },
];

/** Brand glyphs as simple outlines (the icon library has no brand logos). */
type IconProps = { className?: string; "aria-hidden"?: boolean };
const svg = (children: React.ReactNode) => function SocialGlyph({ className, ...rest }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>{children}</svg>;
};
const SOCIAL_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  Facebook: svg(<path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V8.8c0-.2.1-.3.3-.3z" />),
  Instagram: svg(<><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" /></>),
  YouTube: svg(<><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" /></>),
  TikTok: svg(<path d="M15 4v9.2a3.7 3.7 0 1 1-3.7-3.7M15 4c.3 2.3 1.9 3.9 4.2 4.1" />),
};

const colHead = "text-sm font-bold uppercase tracking-[0.1em] text-white";
const rowLink = "group inline-flex min-h-8 items-center gap-2 rounded-sm text-sm text-white/75 transition-colors hover:text-white";

function LinkList({ items, label }: { items: typeof support; label: string }) {
  return (
    <nav aria-label={label}>
      <h2 className={colHead}>{label}</h2>
      <ul className="mt-4 space-y-0.5">
        {items.map(({ href, label: l, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={rowLink}>
              <Icon className="h-4 w-4 shrink-0 text-white/45" strokeWidth={1.75} aria-hidden />
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ContactRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 text-sm">
        <span className="block text-xs text-white/60">{label}</span>
        <span className="block break-words font-semibold text-white">{children}</span>
      </span>
    </li>
  );
}

/** Dark footer in the style of large brand stores (ugreen.lk): newsletter, link columns, then an orange social bar (when set). */
export async function Footer({ halloween = false }: { halloween?: boolean }) {
  const [categories, checkout] = await Promise.all([
    listProducts({ pageSize: 1 }).then((r) => r.categories).catch(() => []),
    getCheckoutAvailability().catch(() => null),
  ]);
  const info = await getStoreInfo();
  // The service row at the top, as on ugreen.lk: only what the live ERP settings confirm, plus tracking and support.
  const cod = Boolean(checkout?.enabled && checkout.settings?.paymentMethods.COD);
  const charge = checkout?.enabled ? (checkout.settings?.deliveryCharge ?? null) : null;
  const services: { icon: LucideIcon; title: string; text: string }[] = [
    ...(cod ? [{ icon: Banknote, title: "Cash on delivery", text: "Pay when your order arrives." }] : []),
    ...(charge != null ? [{ icon: Truck, title: `Delivery ${formatLkr(charge)}`, text: "Shown before you order." }] : []),
    { icon: PackageSearch, title: "Track your order", text: "Follow it with your reference." },
    { icon: Headset, title: "Customer support", text: "We are here to help." },
  ];
  const social = socialFrom(info);
  const phones = [info.phone, info.phone2].filter(Boolean);
  const hasContact = phones.length > 0 || info.whatsapp || info.email || info.address || info.hours.length > 0;

  return (
    <footer className={`on-dark relative bg-ink pb-16 text-white/80 md:pb-0 ${halloween ? "mt-32 sm:mt-40" : "mt-16"}`}>
      {halloween ? <HalloweenSkyline /> : null}
      <ul aria-label="Our service" className="container-page grid grid-cols-2 border-b border-white/10 lg:grid-cols-4">
        {services.map(({ icon: I, title, text }, i) => (
          <li key={title} className={`flex items-center gap-3 py-6 sm:gap-4 sm:px-4 ${i > 0 ? "lg:border-l lg:border-white/10" : ""}`}>
            <I className="h-9 w-9 shrink-0 text-white/80 sm:h-11 sm:w-11" strokeWidth={1.2} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{title}</span>
              <span className="block text-xs text-white/65 sm:text-sm">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* Newsletter: new arrivals and price drops by email. */}
      <div className="border-b border-white/10">
        <div className="container-page flex flex-col gap-5 py-9 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-md">
            <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">
              Get the deals first
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-white/70">New arrivals and price drops in your inbox, about twice a month. Unsubscribe any time.</p>
          </div>
          <div className="w-full lg:max-w-lg">
            <NewsletterForm />
          </div>
        </div>
      </div>

      <div className="container-page relative grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:gap-x-8 md:grid-cols-3 lg:grid-cols-[1.3fr_0.9fr_1.1fr_0.9fr_1.4fr] lg:gap-y-0 lg:py-14">
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <Wordmark pumpkin={halloween} className="text-[2.1rem] leading-none text-white" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">{siteConfig.description}</p>
        </div>

        <nav aria-label="Shop categories">
          <h2 className={colHead}>Shop</h2>
          <ul className="mt-4 space-y-0.5">
            <li><Link className={rowLink} href="/products"><ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden />All products</Link></li>
            <li><Link className={rowLink} href="/brands"><ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden />Shop by brand</Link></li>
            {categories.slice(0, 7).map((c) => (
              <li key={c.slug}><Link className={rowLink} href={`/categories/${c.slug}`}><ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden />{c.name}</Link></li>
            ))}
          </ul>
        </nav>

        <LinkList items={support} label="Support" />
        <LinkList items={company} label="Company" />

        <div className={hasContact ? "col-span-2 md:col-span-3 lg:col-span-1" : "lg:col-span-1"}>
          <h2 className={colHead}>Contact</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {phones.length > 0 && (
              <ContactRow icon={Phone} label="Call us">
                {phones.map((n) => <a key={n} href={telHref(n)} className="mr-3 inline-flex items-center py-1 hover:text-white hover:underline pointer-coarse:min-h-11">{n}</a>)}
              </ContactRow>
            )}
            {info.whatsapp && <ContactRow icon={MessageSquare} label="WhatsApp"><a href={`https://wa.me/${info.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline">{info.whatsapp}</a></ContactRow>}
            {info.email && <ContactRow icon={Mail} label="Email us"><a href={`mailto:${info.email}`} className="hover:text-white hover:underline">{info.email}</a></ContactRow>}
            {info.address && <ContactRow icon={MapPin} label="Visit us at">{info.address}</ContactRow>}
            {info.hours.length > 0 && (
              <ContactRow icon={Clock} label="Business hours">
                {info.hours.map((h) => <span key={h} className="block text-sm font-normal text-white/80">{h}</span>)}
              </ContactRow>
            )}
            {!hasContact && <li><Link href="/contact" className={rowLink}><MessageSquare className="h-4 w-4 text-white/45" strokeWidth={1.75} aria-hidden />Contact details</Link></li>}
          </ul>
        </div>
      </div>

      {/* As on ugreen.lk: a coloured bar (orange here) with the payment badges and the social links, then the small print. */}
      <div className="border-t border-white/10 bg-black text-white">
        {info.payments.length > 0 || social.length > 0 ? (
          <div className="container-page flex flex-wrap items-center justify-between gap-x-10 gap-y-4 border-b border-white/25 py-4">
            {info.payments.length > 0 ? (
              <div>
                <p className="text-sm font-bold">Payment System:</p>
                <ul aria-label="Payment System" className="mt-2 flex flex-wrap gap-2">
                  {info.payments.map((k) => (
                    <li key={k} className="flex h-8 min-w-14 items-center justify-center rounded-[6px] bg-white px-2.5 text-[11px] font-extrabold tracking-wide text-ink">{PAYMENT_BADGES[k]}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {social.length > 0 ? (
              <div>
                <p className="text-sm font-bold">Our Social Links:</p>
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Social media">
                  {social.map((x) => {
                    const Icon = SOCIAL_ICON[x.label] ?? Share2;
                    return (
                      <li key={x.label}>
                        <a
                          href={x.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${x.label} (opens in a new tab)`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white hover:text-ink"
                        >
                          <Icon className="h-[18px] w-[18px]" aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-5">
          <div className="text-sm font-semibold">
            <p>© {new Date().getFullYear()} VOLTA.LK. All rights reserved.</p>
            <p className="mt-1 text-xs font-medium">Prices and availability are subject to change without notice.</p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold md:ml-auto md:mr-2">
            <li><Link href="/privacy-policy" className="inline-flex min-h-6 items-center hover:underline pointer-coarse:min-h-11">Privacy policy</Link></li>
            <li><Link href="/terms" className="inline-flex min-h-6 items-center hover:underline pointer-coarse:min-h-11">Terms & conditions</Link></li>
          </ul>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
