import { Boxes, Mail, MapPin, MessageCircle } from "lucide-react";
import { Body } from "@/components/layout/info-content";
import { infoMetadata } from "@/components/layout/info-page-view";
import { Breadcrumbs } from "@/components/ui/chrome";
import { WholesaleForm } from "@/components/wholesale/wholesale-form";
import { getInfoPage } from "@/lib/info-pages";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";
export const generateMetadata = () => infoMetadata("wholesale");

/** The wholesale registration page on its own: what it is for, who to talk to, and the form. The text is editable in the admin. */
export default async function WholesalePage() {
  const { content } = await getInfoPage("wholesale");
  const wa = siteConfig.whatsapp.replace(/\D/g, "");
  const contact = [
    siteConfig.address && { icon: MapPin, text: siteConfig.address },
    wa && { icon: MessageCircle, text: "Message us on WhatsApp", href: `https://wa.me/${wa}` },
    siteConfig.email && { icon: Mail, text: siteConfig.email, href: `mailto:${siteConfig.email}` },
  ].filter(Boolean) as { icon: typeof Mail; text: string; href?: string }[];

  return (
    <div>
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Wholesale registration" }]} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-brand-600">
            <Boxes className="h-4 w-4" aria-hidden /> For businesses
          </p>
          <h1 className="page-title mt-2 animate-lift">{content.title}</h1>
          <span aria-hidden className="mt-4 block h-1 w-12 rounded-full bg-brand-500" />
          {content.intro && <p className="mt-4 text-base leading-7 text-muted sm:text-[1.0625rem]">{content.intro}</p>}

          <ol className="mt-8 space-y-4">
            {content.sections.map((s, i) => (
              <li key={`${s.heading}-${i}`} className="animate-lift rounded-2xl bg-surface p-5 sm:p-6" style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
                <div className="flex items-start gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-on-brand">{i + 1}</span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-ink">{s.heading}</h2>
                    <div className="mt-2 space-y-3 text-[15px] leading-7 text-muted [&_li]:marker:text-brand-500 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                      <Body text={s.body} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {contact.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border p-5 sm:p-6">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Talk to us first</h2>
              <ul className="mt-3 space-y-2.5">
                {contact.map(({ icon: Icon, text, href }) => (
                  <li key={text} className="flex items-start gap-3 text-[15px]">
                    <Icon className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                    {href ? <a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="break-words font-medium text-ink hover:text-brand-600 hover:underline">{text}</a> : <span className="break-words text-ink">{text}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <section id="register" aria-labelledby="register-title" className="min-w-0 scroll-mt-40 lg:sticky lg:top-40 lg:self-start">
          <div className="animate-lift rounded-2xl border border-border bg-white p-5 shadow-[0_24px_50px_-32px_rgba(17,17,17,0.35)] sm:p-8 [--d:100ms]">
            <h2 id="register-title" className="text-2xl font-semibold tracking-tight text-ink">Register here</h2>
            <p className="mb-5 mt-1 text-[15px] text-muted">Fields marked * are needed.</p>
            <WholesaleForm />
          </div>
        </section>
      </div>
    </div>
  );
}
