import Link from "next/link";
import { Headset, MapPin, PackageSearch, Truck, Wallet, Zap } from "lucide-react";
import { Suspense } from "react";
import { listBrands, listProducts } from "@/lib/erp/catalogue";
import { getSettings } from "@/lib/erp/settings";
import { DELIVERY_PROMISE } from "@/lib/brand";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";
import { CartLink } from "./cart-link";
import { WishlistLink } from "./wishlist-link";
import { CategoryNav } from "./category-nav";
import { HeaderShell } from "./header-shell";
import { MobileMenu } from "./mobile-menu";
import { MobileSearch } from "./mobile-search";
import { SearchBox } from "./search-box";

type NavData = { categories: { slug: string; name: string; subs: { slug: string; name: string }[] }[]; hasDeals: boolean; hasBrands: boolean; quick: { label: string; href: string }[] };
const navCache = globalThis as unknown as { __voltaNav?: NavData };

async function loadNavData(): Promise<NavData> {
  try {
    const [cats, deals, brands] = await Promise.all([listProducts({ pageSize: 1 }), listProducts({ pageSize: 1, onSale: true }), listBrands()]);
    // "Popular" = the biggest brands and categories in the catalogue (we have no search-history data)
    const quick = [
      ...brands.slice(0, 4).map((b) => ({ label: b.name, href: `/search?q=${encodeURIComponent(b.name)}` })),
      ...[...cats.categories].sort((a, b) => b.count - a.count).slice(0, 3).map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
    ];
    const data: NavData = { categories: cats.categories.map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.map((x) => ({ slug: x.slug, name: x.name })) })), hasDeals: deals.total > 0, hasBrands: brands.length > 0, quick };
    if (data.categories.length) navCache.__voltaNav = data; // remember the last good menu
    return data;
  } catch {
    // The header must still render when the ERP is briefly unreachable: keep showing the last menu that loaded instead of an empty bar.
    return navCache.__voltaNav ?? { categories: [], hasDeals: false, hasBrands: false, quick: [] };
  }
}

export function Wordmark({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  // The "O" of VOLTA is a bolt in an orange disc; ".LK" is orange. Everything scales with the font size.
  return (
    <Link href="/" className={`-my-2 inline-flex items-center py-2 font-extrabold uppercase leading-none tracking-[-0.02em] ${dark ? "text-white" : "text-ink"} ${className}`} aria-label="VOLTA.LK home">
      <span aria-hidden className="inline-flex items-center">
        V
        <span className="mx-[0.04em] inline-flex h-[0.82em] w-[0.82em] items-center justify-center rounded-full bg-brand-500">
          <Zap className="h-[0.52em] w-[0.52em] fill-white text-white" strokeWidth={1.5} />
        </span>
        LTA<span className="text-brand-500">.LK</span>
      </span>
    </Link>
  );
}

export async function Header() {
  const accounts = accountsEnabled();
  const [{ categories, hasDeals, hasBrands, quick }, customer, settings] = await Promise.all([
    loadNavData(),
    accounts ? getCurrentCustomer() : null,
    getSettings().catch(() => null),
  ]);
  const note = siteConfig.announcement || siteConfig.highlights[0] || "Prices and availability are checked again at checkout.";
  const cod = settings?.paymentMethods.COD === true;
  return (
    <>
      {/* The service bar scrolls away with the page; only the logo, search and category rows stay pinned. */}
      <div className="hidden bg-ink text-white md:block">
        <div className="container-wide flex h-9 items-center justify-between gap-6 text-[13px]">
          {/* The service messages glide across and pause on hover; the second run is a hidden copy that makes the loop endless. */}
          <div className="marquee min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]">
            <div className="flex w-max animate-marquee motion-reduce:animate-none">
              {[0, 1].map((run) => (
                <ul key={run} aria-hidden={run === 1 || undefined} className="flex shrink-0 items-center gap-10 pr-10">
                  <li className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    <MapPin className="h-3.5 w-3.5 text-white/60" aria-hidden />
                    {note}
                  </li>
                  {settings ? (
                    <li className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                      <Truck className="h-3.5 w-3.5 text-white/60" aria-hidden />
                      Delivery {formatLkr(settings.deliveryCharge)}
                    </li>
                  ) : null}
                  {cod ? (
                    <li className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                      <Wallet className="h-3.5 w-3.5 text-white/60" aria-hidden />
                      Cash on delivery
                    </li>
                  ) : null}
                  <li className="shrink-0 whitespace-nowrap">
                    <Link href="/contact" tabIndex={run === 1 ? -1 : undefined} className="flex items-center gap-1.5 rounded-sm hover:underline">
                      <Headset className="h-3.5 w-3.5 text-white/60" aria-hidden /> Customer Support
                    </Link>
                  </li>
                </ul>
              ))}
            </div>
          </div>
          <nav aria-label="Help" className="flex shrink-0 items-center gap-4">
            {siteConfig.phone ? <a href={`tel:${siteConfig.phone}`} className="rounded-sm hover:underline">{siteConfig.phone}</a> : null}
            <Link href="/track-order" className="inline-flex h-10 items-center rounded-sm hover:underline">Track Order</Link>
            <Link href="/about" className="inline-flex h-10 items-center rounded-sm hover:underline">About</Link>
            <Link href="/contact" className="inline-flex h-10 items-center rounded-sm hover:underline">Contact</Link>
            {siteConfig.address ? <Link href="/contact" className="rounded-sm hover:underline">Visit</Link> : null}
          </nav>
        </div>
      </div>
      {/* Phones: the delivery promise glides across, always moving (copies keep the loop endless and gap-free). */}
      <div className="overflow-hidden bg-ink py-1.5 text-xs font-medium text-white md:hidden">
        <div className="flex w-max animate-marquee [animation-duration:32s] motion-reduce:animate-none">
          {[0, 1, 2, 3].map((run) => (
            <p key={run} aria-hidden={run > 0 || undefined} className="shrink-0 whitespace-nowrap pr-10">
              {DELIVERY_PROMISE}{cod ? " · Cash on delivery" : ""} · Island-wide, tracked online
            </p>
          ))}
        </div>
      </div>
      <HeaderShell>
        <div className="container-wide flex items-center gap-2 py-2 md:grid md:h-[4.5rem] md:transition-[height] md:duration-300 md:group-data-[scrolled=true]/hdr:h-14 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-8 md:py-0 lg:gap-x-12">
          <MobileMenu categories={categories} hasDeals={hasDeals} />
          <Wordmark className="text-xl transition-[font-size] duration-300 min-[360px]:text-[1.375rem] md:text-[1.625rem] md:group-data-[scrolled=true]/hdr:text-[1.375rem]" />
          <div className="hidden md:block">
            <SearchBox size="lg" />
          </div>
          <div className="ml-auto flex items-center gap-0.5 md:ml-0">
            <Link href="/contact" className="hidden min-h-11 items-center gap-2 px-3 text-sm font-medium hover:text-brand-600 lg:inline-flex">
              <Headset className="h-5 w-5" strokeWidth={1.5} aria-hidden /> Support
            </Link>
            {accounts ? (
              <span className="hidden md:block"><AccountMenu customer={customer ? { name: customer.name } : null} enabled /></span>
            ) : (
              <Link href="/track-order" className="hidden items-center gap-2 pr-5 text-sm font-medium hover:text-brand-600 lg:inline-flex">
                <PackageSearch className="h-5 w-5" strokeWidth={1.5} aria-hidden /> Track Order
              </Link>
            )}
            <WishlistLink />
            <CartLink />
          </div>
        </div>
        <div className="container-wide pb-2.5 md:hidden"><MobileSearch quick={quick} bar /></div>
        <Suspense fallback={null}>
          <CategoryNav categories={categories} showDeals={hasDeals} showBrands={hasBrands} />
        </Suspense>
      </HeaderShell>
    </>
  );
}
