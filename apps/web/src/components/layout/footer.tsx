import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Banknote, ChevronRight, Clock, Heart, Mail, MapPin, MessageCircle, PackageSearch, Phone, Share2, type LucideIcon } from "lucide-react";
import { listProducts } from "@/lib/erp/catalogue";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { cleanCategories } from "@/lib/hygiene";
import { socialLinks } from "@/lib/home-config";
import { siteConfig } from "@/lib/site-config";
import { BackToTop } from "./back-to-top";
import { Wordmark } from "./header";

/** Brand glyphs as simple outlines (the icon library has no brand logos). */
type IconProps = { className?: string; "aria-hidden"?: boolean };
const svg = (children: React.ReactNode) =>
  function SocialGlyph({ className, ...rest }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
        {children}
      </svg>
    );
  };
const SOCIAL_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  Facebook: svg(<path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V8.8c0-.2.1-.3.3-.3z" />),
  Instagram: svg(<><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" /></>),
  YouTube: svg(<><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" /></>),
  TikTok: svg(<path d="M15 4v9.2a3.7 3.7 0 1 1-3.7-3.7M15 4c.3 2.3 1.9 3.9 4.2 4.1" />),
};

const PAYMENT_NAMES: Record<string, string> = { visa: "Visa", mastercard: "Master", amex: "Amex", frimi: "FriMi", ezcash: "eZ Cash", mcash: "mCash", koko: "Koko", genie: "Genie" };

/** The brand's own logo from public/payments/<id>.svg when present; otherwise its name as a plain label. */
function PaymentBadge({ id }: { id: string }) {
  const name = PAYMENT_NAMES[id];
  const hasLogo = fs.existsSync(path.join(process.cwd(), "public", "payments", `${id}.svg`));
  return (
    <li className="flex h-8 min-w-12 items-center justify-center rounded-md bg-white px-2.5">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/payments/${id}.svg`} alt={name} width={40} height={20} className="h-5 w-auto max-w-12 object-contain" loading="lazy" />
      ) : (
        <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{name}</span>
      )}
    </li>
  );
}

const linkCls = "group/l inline-flex min-h-9 items-center gap-1.5 text-[15px] text-white/75 transition-colors duration-200 hover:text-white";
const chev = "h-3.5 w-3.5 text-white/40 transition-transform duration-200 group-hover/l:translate-x-0.5 group-hover/l:text-brand-500 motion-reduce:transition-none";

const help = [
  { href: "/track-order", label: "Track order" },
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/returns-policy", label: "Returns" },
  { href: "/warranty", label: "Warranty" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact us" },
];
const company = [
  { href: "/about", label: "About us" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/privacy-policy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
];

function Column({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white">{title}</h2>
      <span aria-hidden className="mt-2 block h-0.5 w-8 rounded-full bg-brand-500" />
      <ul className="mt-3">{children}</ul>
    </nav>
  );
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={linkCls}>
        {children}
        <ChevronRight className={chev} aria-hidden />
      </Link>
    </li>
  );
}

type Row = { icon: LucideIcon; text: string; href?: string };

export async function Footer() {
  const categories = await listProducts({ pageSize: 1 })
    .then((r) => cleanCategories(r.categories))
    .catch(() => []);
  const social = socialLinks();
  const phone = siteConfig.phone;
  const wa = siteConfig.whatsapp.replace(/\D/g, "");
  const payments = siteConfig.paymentMethods;
  // The warranty link appears only once the business has approved the warranty terms.
  const helpLinks = siteConfig.warrantyApproved ? help : help.filter((l) => l.href !== "/warranty");
  const contact = [
    siteConfig.address && { icon: MapPin, text: siteConfig.address },
    phone && { icon: Phone, text: phone, href: `tel:${phone.replace(/\s/g, "")}` },
    siteConfig.email && { icon: Mail, text: siteConfig.email, href: `mailto:${siteConfig.email}` },
    siteConfig.hours.length > 0 && { icon: Clock, text: siteConfig.hours.join(" · ") },
  ].filter(Boolean) as Row[];

  return (
    <footer className="on-dark mt-14 bg-dark text-white sm:mt-20">
      <div className="container-page">
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr] lg:gap-8 lg:py-16">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Wordmark dark className="text-3xl" />
            <p className="mt-4 max-w-xs text-[15px] leading-6 text-white/70">{BRAND_TAGLINE}. Genuine products, delivered island-wide.</p>
            {contact.length > 0 && (
              <ul className="mt-5 space-y-2.5">
                {contact.map(({ icon: Icon, text, href }) => (
                  <li key={text} className="flex items-start gap-3 text-[15px] text-white/80">
                    <Icon className="mt-1 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                    {href ? <a href={href} className="break-words hover:text-white hover:underline">{text}</a> : <span className="break-words">{text}</span>}
                  </li>
                ))}
              </ul>
            )}
            {social.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Social media">
                {social.map((sl) => {
                  const Icon = SOCIAL_ICON[sl.label] ?? Share2;
                  return (
                    <li key={sl.label}>
                      <a
                        href={sl.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${sl.label} (opens in a new tab)`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-brand-500 hover:text-on-brand"
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Column title="Shop" label="Shop categories">
            <Item href="/products">All products</Item>
            {categories.slice(0, 6).map((c) => (
              <Item key={c.slug} href={`/categories/${c.slug}`}>{c.name}</Item>
            ))}
            <Item href="/brands">Brands</Item>
          </Column>
          <Column title="Help" label="Help">
            {helpLinks.map((l) => (
              <Item key={l.href} href={l.href}>{l.label}</Item>
            ))}
          </Column>
          <Column title="Company" label="Company">
            {company.map((l) => (
              <Item key={l.href} href={l.href}>{l.label}</Item>
            ))}
          </Column>

          {/* Help card, in the same rounded card style as the rest of the site */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
              <p className="text-lg font-semibold leading-snug text-white">Need help choosing?</p>
              <p className="mt-1.5 text-[15px] leading-6 text-white/65">Call or message us, or check where your order is.</p>
              <div className="mt-4 flex flex-col gap-2.5">
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-primary rounded-full">
                    <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp us
                  </a>
                )}
                {phone && (
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className={wa ? "btn rounded-full border border-white/25 text-white hover:bg-white/10" : "btn-primary rounded-full"}>
                    <Phone className="h-4 w-4" aria-hidden /> Call {phone}
                  </a>
                )}
                <Link href="/track-order" className="btn rounded-full border border-white/25 text-white hover:bg-white/10">
                  <PackageSearch className="h-4 w-4" aria-hidden /> Track your order
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="grid items-center gap-4 border-t border-white/10 py-6 md:grid-cols-[1fr_auto_1fr]">
          <p className="text-[13px] text-white/55">© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
          <ul className="flex flex-wrap items-center gap-2 md:justify-center" aria-label="Accepted payment methods">
            <li className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2.5 text-[13px] font-semibold text-ink">
              <Banknote className="h-4 w-4" aria-hidden />
              Cash on Delivery
            </li>
            {payments.map((id) => <PaymentBadge key={id} id={id} />)}
          </ul>
          <div className="flex items-center gap-4 md:justify-end">
            <p className="inline-flex items-center gap-1.5 text-[13px] text-white/55">
              Made with <Heart className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-label="love" /> in Sri Lanka
            </p>
            <BackToTop />
          </div>
        </div>
      </div>
    </footer>
  );
}
