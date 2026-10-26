import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  Banknote, Building2, ChevronRight, Clock, FileText, HelpCircle, Mail, MapPin, MessageSquare, PackageSearch, Phone, RefreshCw, Share2, ShieldCheck, Truck,
  type LucideIcon,
} from "lucide-react";
import { listProducts } from "@/lib/erp/catalogue";
import { getSettings } from "@/lib/erp/settings";
import { socialLinks } from "@/lib/home-config";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { BackToTop } from "./back-to-top";
import { Wordmark } from "./wordmark";

const support: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/track-order", label: "Track your order", icon: PackageSearch },
  { href: "/contact", label: "Contact us", icon: MessageSquare },
  { href: "/shipping-policy", label: "Shipping policy", icon: Truck },
  { href: "/returns-policy", label: "Returns policy", icon: RefreshCw },
  { href: "/#faq", label: "Frequently asked questions", icon: HelpCircle },
];
const company: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/about", label: "About us", icon: Building2 },
  { href: "/privacy-policy", label: "Privacy policy", icon: ShieldCheck },
  { href: "/terms", label: "Terms & conditions", icon: FileText },
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

const PAYMENT_NAMES: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", frimi: "FriMi", ezcash: "eZ Cash", mcash: "mCash", koko: "KOKO", genie: "Genie" };

/** The brand's own logo from public/payments/<id>.svg when the owner has added it; otherwise its name as a plain label. */
function PaymentBadge({ id }: { id: string }) {
  const name = PAYMENT_NAMES[id];
  const hasLogo = fs.existsSync(path.join(process.cwd(), "public", "payments", `${id}.svg`));
  return (
    <li className="flex h-8 min-w-[3.5rem] items-center justify-center rounded-sm bg-white px-3">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/payments/${id}.svg`} alt={name} width={48} height={24} className="h-6 w-auto max-w-[3.5rem] object-contain" loading="lazy" />
      ) : (
        <span className="whitespace-nowrap text-xs font-bold text-on-brand">{name}</span>
      )}
    </li>
  );
}

const colHead = "text-sm font-bold uppercase tracking-[0.1em] text-ink";
const accentBar = "mt-2.5 block h-0.5 w-8 bg-brand-500";
const rowLink = "group inline-flex min-h-8 items-center gap-2 rounded-sm text-sm text-ink/75 transition-colors hover:text-brand-600";

function LinkList({ items, label }: { items: typeof support; label: string }) {
  return (
    <nav aria-label={label}>
      <h2 className={colHead}>{label}</h2>
      <span className={accentBar} aria-hidden />
      <ul className="mt-4 space-y-0.5">
        {items.map(({ href, label: l, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={rowLink}>
              <Icon className="h-4 w-4 shrink-0 text-brand-500/70 transition-colors group-hover:text-brand-600" strokeWidth={1.75} aria-hidden />
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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-on-brand shadow-neon"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0 text-sm">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block break-words font-semibold text-ink">{children}</span>
      </span>
    </li>
  );
}

export async function Footer() {
  const [categories, settings] = await Promise.all([
    listProducts({ pageSize: 1 }).then((r) => r.categories).catch(() => []),
    getSettings().catch(() => null),
  ]);
  const social = socialLinks();
  const cod = Boolean(settings?.paymentMethods.COD);
  // Only facts the store can stand behind: the checkout rules come from the live ERP settings.
  const trust = [
    ...(cod ? [{ icon: Banknote, text: "Cash on delivery" }] : []),
    ...(settings ? [{ icon: Truck, text: `Delivery ${formatLkr(settings.deliveryCharge)}` }] : []),
    { icon: PackageSearch, text: "Track online" },
  ];
  const hasContact = siteConfig.phone || siteConfig.email || siteConfig.address || siteConfig.hours.length > 0;

  return (
    <footer className="relative mt-16 border-t-[3px] border-brand-500 bg-gradient-to-b from-brand-50 via-bg to-bg pb-16 text-ink shadow-[0_-6px_24px_-8px_rgb(255_92_0/0.5)] md:pb-0">
      <div className="container-page relative grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:gap-x-8 md:grid-cols-3 lg:grid-cols-[1.3fr_0.9fr_1.1fr_0.9fr_1.4fr] lg:gap-y-0 lg:py-14">
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <Wordmark className="text-[2.1rem] leading-none text-ink" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-ink/70">{siteConfig.description}</p>
          {social.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-3" aria-label="Social media">
              {social.map((s) => {
                const Icon = SOCIAL_ICON[s.label] ?? Share2;
                return (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`${s.label} (opens in a new tab)`} className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-500/40 bg-bg text-brand-600 transition-colors hover:bg-brand-500 hover:text-on-brand hover:shadow-neon">
                      <Icon className="h-5 w-5" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5 border-t border-brand-100 pt-5">
            {trust.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-[13px] text-ink/75"><Icon className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={1.75} aria-hidden />{text}</li>
            ))}
          </ul>
        </div>

        <nav aria-label="Shop categories">
          <h2 className={colHead}>Shop</h2>
          <span className={accentBar} aria-hidden />
          <ul className="mt-4 space-y-0.5">
            <li><Link className={rowLink} href="/products"><ChevronRight className="h-4 w-4 shrink-0 text-brand-500/70 group-hover:text-brand-600" aria-hidden />All products</Link></li>
            {categories.slice(0, 7).map((c) => (
              <li key={c.slug}><Link className={rowLink} href={`/categories/${c.slug}`}><ChevronRight className="h-4 w-4 shrink-0 text-brand-500/70 group-hover:text-brand-600" aria-hidden />{c.name}</Link></li>
            ))}
          </ul>
        </nav>

        <LinkList items={support} label="Support" />
        <LinkList items={company} label="Company" />

        <div className={hasContact ? "col-span-2 md:col-span-3 lg:col-span-1" : "lg:col-span-1"}>
          <h2 className={colHead}>Contact</h2>
          <span className={accentBar} aria-hidden />
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {siteConfig.phone && <ContactRow icon={Phone} label="Customer support"><a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="py-1 hover:underline">{siteConfig.phone}</a></ContactRow>}
            {siteConfig.email && <ContactRow icon={Mail} label="Email us"><a href={`mailto:${siteConfig.email}`} className="hover:underline">{siteConfig.email}</a></ContactRow>}
            {siteConfig.address && <ContactRow icon={MapPin} label="Visit our store">{siteConfig.address}</ContactRow>}
            {siteConfig.hours.length > 0 && (
              <ContactRow icon={Clock} label="Business hours">
                {siteConfig.hours.map((h) => <span key={h} className="block text-sm font-normal text-ink/80">{h}</span>)}
              </ContactRow>
            )}
            {!hasContact && <li><Link href="/contact" className={rowLink}><MessageSquare className="h-4 w-4 text-brand-500/70" strokeWidth={1.75} aria-hidden />Contact details</Link></li>}
          </ul>
        </div>
      </div>

      <div className="relative bg-brand-500 text-on-brand [&_:focus-visible]:outline-ink">
        <div className="container-page flex flex-col gap-5 py-5">
          {(cod || siteConfig.paymentMethods.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink/15 pb-5 text-sm">
              <span className="font-bold">We accept</span>
              <ul className="flex flex-wrap items-center gap-2" aria-label="Accepted payment methods">
                {cod && <li className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-white px-3 text-xs font-bold text-on-brand"><Banknote className="h-4 w-4" aria-hidden />Cash on delivery</li>}
                {siteConfig.paymentMethods.map((id) => <PaymentBadge key={id} id={id} />)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
            <div className="text-sm">
              <p>© {new Date().getFullYear()} VOLTA.LK. All rights reserved.</p>
              <p className="mt-1 text-xs">Prices and availability are subject to change without notice.</p>
            </div>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold md:ml-auto md:mr-2">
              <li><Link href="/privacy-policy" className="inline-flex min-h-6 items-center hover:underline">Privacy policy</Link></li>
              <li><Link href="/terms" className="inline-flex min-h-6 items-center hover:underline">Terms & conditions</Link></li>
            </ul>
            <BackToTop />
          </div>
        </div>
      </div>
    </footer>
  );
}
