import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, PackageSearch, Phone } from "lucide-react";
import { PolicyPage } from "@/components/layout/policy-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "Contact us", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  const cards = [
    siteConfig.phone && { icon: Phone, label: "Phone", value: siteConfig.phone, href: `tel:${siteConfig.phone.replace(/\s/g, "")}` },
    siteConfig.email && { icon: Mail, label: "Email", value: siteConfig.email, href: `mailto:${siteConfig.email}` },
    siteConfig.address && { icon: MapPin, label: "Address", value: siteConfig.address },
    siteConfig.hours.length > 0 && { icon: Clock, label: "Business hours", value: siteConfig.hours.join(" · ") },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string }[];
  return (
    <PolicyPage title="Contact us" intro="Questions about an order or a product? Get in touch." rail={false}>
      <section className="!border-t-0 !pt-0">
        <h2>Our details</h2>
        {cards.length > 0 ? (
          <ul className="grid gap-3 !list-none !pl-0 sm:grid-cols-2">
            {cards.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="flex items-start gap-4 rounded-2xl bg-surface p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{label}</span>
                  {href ? <a className="block break-words font-semibold text-ink hover:underline" href={href}>{value}</a> : <span className="block break-words font-semibold text-ink">{value}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Contact details have not been published yet. For an existing order, please use the <Link className="font-medium text-brand-600 underline" href="/track-order">Track order</Link> page.</p>
        )}
      </section>
      <section>
        <h2>Already ordered?</h2>
        <Link href="/track-order" className="group flex items-center gap-4 rounded-2xl border border-border p-5 transition-colors hover:border-ink/30">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink"><PackageSearch className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">Track your order</span>
            <span className="block text-sm text-muted">Use the reference from your confirmation to see its status online.</span>
          </span>
        </Link>
      </section>
    </PolicyPage>
  );
}
