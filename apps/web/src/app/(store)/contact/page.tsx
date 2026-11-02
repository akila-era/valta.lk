import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Smartphone } from "lucide-react";
import { ContactMessageForm } from "@/components/layout/contact-message-form";
import { getStoreInfo, telHref } from "@/lib/store-info";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact us",
  alternates: { canonical: "/contact" },
};

/**
 * Contact us, laid out as on ugreen.lk: the store's phone, WhatsApp and email, then its address, then "Send us a
 * message", with a map of the address on the right. Everything comes from the admin (Settings, Store details).
 */
export default async function ContactPage() {
  const info = await getStoreInfo();
  const phones = [info.phone, info.phone2].filter(Boolean);
  const hasReach = phones.length > 0 || info.whatsapp || info.email;

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
      <div>
        <h1 className="text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] font-semibold leading-tight text-ink">Contact us</h1>

        {hasReach || info.address ? (
          <ul className="mt-6 divide-y divide-border border-b border-border">
            {hasReach ? (
              <li className="flex gap-4 py-5">
                <Smartphone className="h-9 w-9 shrink-0 text-muted" strokeWidth={1.2} aria-hidden />
                <div className="space-y-1.5 text-[15px] text-ink/80">
                  {phones.length > 0 ? (
                    <p>
                      Call us:{" "}
                      {phones.map((n, i) => (
                        <span key={n}>
                          {i > 0 ? " | " : ""}
                          <a href={telHref(n)} className="hover:text-brand-600 hover:underline">{n}</a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {info.whatsapp ? (
                    <p>
                      WhatsApp:{" "}
                      <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 hover:underline">{info.whatsapp}</a>
                    </p>
                  ) : null}
                  {info.email ? (
                    <p>
                      Email: <a href={`mailto:${info.email}`} className="hover:text-brand-600 hover:underline">{info.email}</a>
                    </p>
                  ) : null}
                </div>
              </li>
            ) : null}
            {info.address ? (
              <li className="flex gap-4 py-5">
                <MapPin className="h-9 w-9 shrink-0 text-muted" strokeWidth={1.2} aria-hidden />
                <div className="text-[15px] text-ink/80">
                  <p className="font-semibold text-ink">{siteConfig.name}</p>
                  <p>{info.address}</p>
                  {info.hours.map((h) => <p key={h} className="text-sm text-muted">{h}</p>)}
                </div>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-6 text-[15px] text-muted">
            Contact details have not been published yet. For an existing order, please use{" "}
            <Link href="/track-order" className="font-semibold text-brand-600 underline">Track order</Link>.
          </p>
        )}

        {info.email ? (
          <section aria-labelledby="send-message" className="mt-8">
            <h2 id="send-message" className="mb-4 text-xl font-semibold text-brand-600">Send us a message</h2>
            <ContactMessageForm email={info.email} />
          </section>
        ) : null}
      </div>

      {info.address ? (
        // A map of the store's address (Google Maps, loaded only on this page).
        <div className="min-h-[24rem] overflow-hidden rounded-card bg-surface lg:min-h-full">
          <iframe
            title={`Map: ${info.address}`}
            src={`https://www.google.com/maps?q=${encodeURIComponent(info.address)}&output=embed`}
            className="h-full min-h-[24rem] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}
    </div>
  );
}
