import Link from "next/link";
import { Clock, HelpCircle, Mail, PackageSearch, Phone, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { SectionIntro } from "./home-sections";

/**
 * Assurances: only the lines the business itself entered in the site settings (SITE_HIGHLIGHTS), for example a warranty
 * statement it has confirmed. Nothing is written here for the shop, and the band is hidden when there are none.
 */
export function Assurances() {
  const lines = siteConfig.highlights;
  if (!lines.length) return null;
  return (
    <section aria-labelledby="assurances" className="mt-10 sm:mt-14">
      <div className="rounded-[1.75rem] bg-brand-50 p-6 sm:p-10">
        <h2 id="assurances" className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Good to know</h2>
        <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((l) => (
            <li key={l} className="flex items-start gap-3 text-base font-medium text-ink">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
          <Link href="/shipping-policy" className="inline-flex min-h-11 items-center gap-2 text-brand-700 underline-offset-4 hover:underline"><Truck className="h-4 w-4" aria-hidden /> Shipping policy</Link>
          <Link href="/returns-policy" className="inline-flex min-h-11 items-center gap-2 text-brand-700 underline-offset-4 hover:underline"><RefreshCw className="h-4 w-4" aria-hidden /> Returns policy</Link>
        </p>
      </div>
    </section>
  );
}

/**
 * Help section. The store has no reviews to show, so instead of a testimonials block this one is useful: quick answers, order
 * tracking and the contact details the business has published (only those that are set).
 */
export function SupportSection() {
  const details = [
    siteConfig.phone && { icon: Phone, label: "Call us", text: siteConfig.phone, href: `tel:${siteConfig.phone.replace(/\s/g, "")}` },
    siteConfig.email && { icon: Mail, label: "Email us", text: siteConfig.email, href: `mailto:${siteConfig.email}` },
    siteConfig.hours.length > 0 && { icon: Clock, label: "Business hours", text: siteConfig.hours.join(" · ") },
  ].filter(Boolean) as { icon: typeof Phone; label: string; text: string; href?: string }[];
  const links = [
    { icon: HelpCircle, title: "Quick answers", text: "Paying, delivery, stock and returns.", href: "/faq" },
    { icon: PackageSearch, title: "Track your order", text: "Use the reference from your confirmation.", href: "/track-order" },
  ];
  return (
    <section aria-labelledby="support" className="mt-10 sm:mt-14">
      <SectionIntro id="support" eyebrow="Support" title="Need help choosing?">
        We are happy to help with an order or a product.
      </SectionIntro>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {links.map(({ icon: Icon, title, text, href }) => (
          <Link key={href} href={href} className="group flex min-h-[9rem] flex-col justify-between gap-6 lg:min-h-[13rem] lg:gap-8 rounded-[1.75rem] bg-surface p-6 transition-colors hover:bg-[#ececec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none sm:p-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors group-hover:bg-brand-500 group-hover:text-on-brand"><Icon className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold tracking-tight">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-muted">{text}</span>
            </span>
          </Link>
        ))}
        <div className="rounded-[1.75rem] bg-ink p-6 text-white sm:p-8">
          <h3 className="text-lg font-semibold tracking-tight">Contact us</h3>
          {details.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {details.map(({ icon: Icon, label, text, href }) => (
                <li key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs text-white/70">{label}</span>
                    {href ? <a href={href} className="block break-words text-sm font-semibold hover:underline">{text}</a> : <span className="block text-sm font-semibold">{text}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-white/75">Use the contact page to get in touch.</p>
          )}
          <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-400">Contact page</Link>
        </div>
      </div>
    </section>
  );
}
