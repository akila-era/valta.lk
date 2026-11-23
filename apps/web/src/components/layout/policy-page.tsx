import type { ReactNode } from "react";
import Link from "next/link";
import { Clock, Info, Mail, PackageSearch, Phone } from "lucide-react";
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

/**
 * Desktop side panel with the contact details the business has actually published (site settings). Nothing is made up:
 * it shows only what is configured, and nothing at all when no phone or email is set.
 */
function HelpRail() {
  const rows = [
    siteConfig.phone && { icon: Phone, label: "Call us", text: siteConfig.phone, href: `tel:${siteConfig.phone.replace(/\s/g, "")}` },
    siteConfig.email && { icon: Mail, label: "Email us", text: siteConfig.email, href: `mailto:${siteConfig.email}` },
    siteConfig.hours.length > 0 && { icon: Clock, label: "Business hours", text: siteConfig.hours.join(" · ") },
  ].filter(Boolean) as { icon: typeof Phone; label: string; text: string; href?: string }[];
  if (rows.length === 0 || (!siteConfig.phone && !siteConfig.email)) return null;
  return (
    <aside aria-label="Contact" className="hidden lg:block lg:sticky lg:top-40 lg:self-start">
      <div className="rounded-[1.5rem] bg-ink p-6 text-white">
        <h2 className="text-lg font-semibold tracking-tight">Need a hand?</h2>
        <ul className="mt-4 space-y-4">
          {rows.map(({ icon: Icon, label, text, href }) => (
            <li key={label} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs text-white/70">{label}</span>
                {href ? <a href={href} className="block break-words text-sm font-semibold hover:underline">{text}</a> : <span className="block text-sm font-semibold">{text}</span>}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/track-order" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-400">
          <PackageSearch className="h-4 w-4" aria-hidden /> Track your order
        </Link>
      </div>
    </aside>
  );
}

/**
 * Layout for every information page (About, Contact, FAQ, policies): navigation on the side, a header band, readable text
 * and (on large screens, when the business has published contact details) a contact panel. The Contact page passes
 * `rail={false}` because it already lists those details in full.
 */
export function PolicyPage({ title, intro, children, rail = true }: { title: string; intro?: string; children: ReactNode; rail?: boolean }) {
  const hasRail = rail && Boolean(siteConfig.phone || siteConfig.email);
  return (
    <div className={`grid gap-8 lg:gap-12 ${hasRail ? "lg:grid-cols-[13rem_minmax(0,1fr)_16rem]" : "lg:grid-cols-[13rem_minmax(0,1fr)]"}`}>
      <InfoNav />
      <article className="min-w-0 max-w-3xl">
        <header className="rounded-[1.75rem] bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Help &amp; information</p>
          <h1 className="page-title mt-2">{title}</h1>
          {intro && <p className="mt-3 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">{intro}</p>}
        </header>
        <div className="mt-6 text-[0.9375rem] leading-7 [&>section]:border-t [&>section]:border-border [&>section]:py-8 [&>section:first-child]:border-t-0 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-muted">
          {children}
        </div>
      </article>
      {hasRail && <HelpRail />}
    </div>
  );
}
