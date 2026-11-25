import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info, MessageCircle, PackageSearch, Phone } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { InfoNav } from "./info-nav";

/** Marks policy text that the business has not approved yet. It states what is missing and never fills it in. */
export function ApprovalNotice({ title = "Awaiting business approval", children }: { title?: string; children: ReactNode }) {
  return (
    <div role="note" data-testid="approval-notice" className="flex gap-3 rounded-2xl border border-warn/30 bg-warn-bg p-4 text-warn sm:p-5">
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="!text-warn text-sm font-semibold">{title}</p>
        <div className="mt-1 text-sm leading-6 [&_a]:font-semibold [&_a]:underline">{children}</div>
      </div>
    </div>
  );
}

/** Closing card: where to go with a question. Phone and WhatsApp appear only when the business has set them. */
function HelpCard() {
  const phone = siteConfig.phone;
  const wa = siteConfig.whatsapp.replace(/\D/g, "");
  return (
    <section className="!border-0 !bg-transparent !p-0 md:col-span-2">
      <div className="on-dark relative isolate overflow-hidden rounded-2xl bg-ink p-6 text-white sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-14 -top-20 -z-10 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xl font-semibold leading-snug !text-white">Still have a question?</p>
            <p className="mt-1 text-[15px] leading-6 !text-white/65">We are happy to help with an order or a product.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/contact" className="btn-primary rounded-full">
              Contact us <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn rounded-full border border-white/25 text-white hover:bg-white/10">
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="btn rounded-full border border-white/25 text-white hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden /> {phone}
              </a>
            )}
            <Link href="/track-order" className="btn rounded-full border border-white/25 text-white hover:bg-white/10">
              <PackageSearch className="h-4 w-4" aria-hidden /> Track order
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Layout for every information page (About, FAQ, policies): a header, navigation beside the content, and the page's
 * sections as numbered cards in two columns on wide screens (the first one runs across), ending with a help card.
 * `layout="stack"` keeps one column (FAQ, Contact); `cta={false}` leaves out the closing help card.
 */
export function PolicyPage({ title, intro, children, layout = "grid", cta = true }: { title: string; intro?: string; children: ReactNode; rail?: boolean; layout?: "grid" | "stack"; cta?: boolean }) {
  const grid = layout === "grid";
  return (
    <div>
      <header className="mb-8 border-b border-border pb-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Help &amp; information</p>
        <h1 className="page-title mt-2 animate-lift">{title}</h1>
        <span aria-hidden className="mt-4 block h-1 w-12 rounded-full bg-brand-500" />
        {intro && <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-[1.0625rem]">{intro}</p>}
      </header>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <InfoNav />
        <article className="min-w-0">
          <div
            className={`text-[0.9375rem] leading-7 [counter-reset:card] [&>section]:animate-lift [&>section]:rounded-2xl [&>section]:border [&>section]:border-border [&>section]:bg-white [&>section]:p-5 sm:[&>section]:p-7 [&>section:nth-child(2)]:[--d:70ms] [&>section:nth-child(3)]:[--d:140ms] [&>section:nth-child(4)]:[--d:210ms] [&>section:nth-child(n+5)]:[--d:280ms] [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-muted [&_ul]:marker:text-brand-500 ${
              grid
                ? "grid gap-4 md:grid-cols-2 [&>section:first-child]:md:col-span-2 [&>section:not(:last-child)]:[counter-increment:card] [&>section]:transition-colors [&>section]:duration-200 [&>section:hover]:border-ink/25 [&_h2]:flex [&_h2]:items-baseline [&_h2]:gap-3 [&_h2]:before:text-sm [&_h2]:before:font-semibold [&_h2]:before:tabular-nums [&_h2]:before:text-brand-600 [&_h2]:before:content-[counter(card,decimal-leading-zero)]"
                : "space-y-4 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-3 [&_h2]:before:h-5 [&_h2]:before:w-1 [&_h2]:before:shrink-0 [&_h2]:before:rounded-full [&_h2]:before:bg-brand-500 [&_h2]:before:content-['']"
            }`}
          >
            {children}
            {cta && <HelpCard />}
          </div>
        </article>
      </div>
    </div>
  );
}
