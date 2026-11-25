import Link from "next/link";
import { Headset, PackageSearch, ShieldCheck, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";

interface Item {
  icon: LucideIcon;
  title: string;
  text?: string;
  href?: string;
}

/**
 * Slim trust strip under the hero. Every item is a fact the store really has: the ERP's delivery charge, cash on delivery
 * when the ERP offers it, online order tracking, the published support number, and any claims the business itself has
 * entered in the site settings (SITE_HIGHLIGHTS, for example a warranty line). Nothing is written in here on the shop's behalf.
 */
export function TrustStrip({ checkout }: { checkout: HomeData["checkout"] }) {
  const items: Item[] = [
    checkout.deliveryCharge != null ? { icon: Truck, title: `Delivery ${formatLkr(checkout.deliveryCharge)}`, text: "Shown before you order", href: "/shipping-policy" } : null,
    checkout.cod ? { icon: Wallet, title: "Cash on delivery", text: "Pay when it arrives" } : null,
    { icon: PackageSearch, title: "Track your order", text: "Follow it online", href: "/track-order" },
    { icon: Headset, title: "Customer support", text: siteConfig.phone || "Here to help", href: "/contact" },
    ...siteConfig.highlights.map((h) => ({ icon: ShieldCheck, title: h })),
  ].filter((i): i is Item => Boolean(i)).slice(0, 5);

  return (
    <section aria-label="Shopping with VOLTA.LK" className="container-page mt-8 sm:mt-10">
      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text, href }) => {
          const body = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-on-brand">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-ink">{title}</span>
                {text && <span className="block truncate text-[13px] text-muted">{text}</span>}
              </span>
            </>
          );
          const cls = "group flex h-full items-center gap-3.5 rounded-2xl border border-border bg-white p-4 transition-colors";
          return (
            <li key={title} className="min-w-0">
              {href ? <Link href={href} className={`${cls} hover:border-ink`}>{body}</Link> : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
