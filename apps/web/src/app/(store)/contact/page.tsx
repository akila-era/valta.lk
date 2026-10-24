import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Package, Phone } from "lucide-react";
import { PolicyPage } from "@/components/layout/policy-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact us",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const has = siteConfig.phone || siteConfig.email || siteConfig.address;

  return (
    <PolicyPage
      title="Contact us"
      eyebrow="SUPPORT / REACH OUT"
      intro="Questions about an order, delivery or a product? We are here to help."
    >
      <section>
        <h2>Get in touch</h2>
        <p>
          Reach out to our customer support team directly using the channels below.
        </p>

        {has ? (
          <div className="!mt-6 grid gap-4 sm:grid-cols-2">
            {siteConfig.phone && (
              <a
                href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                className="group flex items-start gap-4 rounded-2xl border border-border/80 bg-warm-white/40 p-4 !text-ink !no-underline transition-all hover:border-brand-500/40 hover:bg-brand-50/30 hover:shadow-soft"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Phone Support
                  </span>
                  <span className="mt-1 block text-base font-bold text-ink underline-offset-4 group-hover:text-brand-600 group-hover:underline">
                    {siteConfig.phone}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Mon–Sat, 9:00 AM – 7:00 PM
                  </span>
                </div>
              </a>
            )}

            {siteConfig.email && (
              <a
                href={`mailto:${siteConfig.email}`}
                className="group flex items-start gap-4 rounded-2xl border border-border/80 bg-warm-white/40 p-4 !text-ink !no-underline transition-all hover:border-brand-500/40 hover:bg-brand-50/30 hover:shadow-soft"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Email Inquiries
                  </span>
                  <span className="mt-1 block text-base font-bold text-ink underline-offset-4 group-hover:text-brand-600 group-hover:underline">
                    {siteConfig.email}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Typically replies within 2 hours
                  </span>
                </div>
              </a>
            )}

            {siteConfig.address && (
              <div className="flex items-start gap-4 rounded-2xl border border-border/80 bg-warm-white/40 p-4 sm:col-span-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    Store Location
                  </span>
                  <span className="mt-1 block text-sm font-medium text-ink">
                    {siteConfig.address}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3">
            Contact details have not been published yet. For an existing order, please use the{" "}
            <Link className="font-semibold text-brand-600 underline" href="/track-order">
              Track order
            </Link>{" "}
            page.
          </p>
        )}
      </section>

      <section>
        <h2>Need order updates?</h2>
        <p>
          You don&apos;t need to call to check order status. Our real-time tracker lets you follow your package from warehouse confirmation to delivery.
        </p>
        <div className="!mt-4">
          <Link
            href="/track-order"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold !text-white !no-underline shadow-soft transition-all hover:bg-brand-500 hover:!text-on-brand hover:shadow-lift"
          >
            <Package className="h-4 w-4" />
            Track Order Status
          </Link>
        </div>
      </section>
    </PolicyPage>
  );
}
