import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/layout/policy-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "Contact us", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  const has = siteConfig.phone || siteConfig.email || siteConfig.address;
  return (
    <PolicyPage title="Contact us" intro="Questions about an order or a product? Get in touch.">
      <section>
        <h2>Our details</h2>
        {has ? (
          <ul className="!list-none !pl-0">
            {siteConfig.phone && <li>Phone: <a className="font-medium text-brand-600 underline" href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}>{siteConfig.phone}</a></li>}
            {siteConfig.email && <li>Email: <a className="font-medium text-brand-600 underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></li>}
            {siteConfig.address && <li>Address: {siteConfig.address}</li>}
          </ul>
        ) : (
          <p>Contact details have not been published yet. For an existing order, please use the <Link className="font-medium text-brand-600 underline" href="/track-order">Track order</Link> page.</p>
        )}
      </section>
    </PolicyPage>
  );
}
