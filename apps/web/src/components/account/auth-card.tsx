import Link from "next/link";
import { ChevronRight, Package, ShoppingBag, Truck, UserRound } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

/** What a customer account really does on this site: checkout prefill, the order list, and tracking from it. */
const BENEFITS = [
  { icon: ShoppingBag, title: "Faster checkout", text: "Your name, phone and email are filled in for you." },
  { icon: Package, title: "All your orders in one place", text: "See every order you placed while signed in." },
  { icon: Truck, title: "Track deliveries", text: "Follow each order's status from your account." },
];

/**
 * Account pages (sign in, register, password reset, admin sign in): breadcrumbs, then the form on a plain card. With
 * `tabs` the card starts with Sign in / Create account tabs and an orange panel lists what an account offers.
 */
export function AuthCard({
  title,
  intro,
  children,
  footer,
  tabs,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The sign-in / register pair: which one this page is, and the `next` path to carry to the other. */
  tabs?: { active: "login" | "register"; next?: string };
}) {
  const query = tabs?.next ? `?next=${encodeURIComponent(tabs.next)}` : "";
  const card = (
    <div className="rounded-panel border border-border bg-bg shadow-card">
      {tabs ? (
        <nav aria-label="Account" className="grid grid-cols-2 border-b border-border text-sm font-bold">
          {([["login", "Sign in", "/account/login"], ["register", "Create account", "/account/register"]] as const).map(([id, label, href]) => {
            const on = tabs.active === id;
            return (
              <Link
                key={id}
                href={href + query}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-12 items-center justify-center transition-colors ${on ? "text-brand-600" : "text-muted hover:text-ink"}`}
              >
                {label}
                {on ? <span aria-hidden className="absolute inset-x-6 -bottom-px h-[3px] rounded-t-full bg-brand-500 shadow-[0_0_8px_rgb(255_92_0/0.7)]" /> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div className="p-6 sm:p-8">
        {tabs ? null : (
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-on-brand shadow-neon">
            <UserRound className="h-6 w-6" aria-hidden />
          </span>
        )}
        <h1 className="statement text-2xl leading-tight text-ink">{title}</h1>
        {intro && <p className="mt-1.5 text-sm leading-6 text-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );

  return (
    <div className={`mx-auto w-full py-2 sm:py-6 ${tabs ? "max-w-5xl" : "max-w-md"}`}>
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className={`flex flex-wrap items-center gap-1.5 text-[13px] text-muted ${tabs ? "" : "justify-center"}`}>
          <li><Link href="/" className="inline-flex min-h-6 items-center hover:text-brand-600">Home</Link></li>
          <ChevronRight className="h-3.5 w-3.5 text-muted/60" aria-hidden />
          <li><span>Account</span></li>
          <ChevronRight className="h-3.5 w-3.5 text-muted/60" aria-hidden />
          <li><span className="font-medium text-ink" aria-current="page">{title}</span></li>
        </ol>
      </nav>

      {tabs ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-8">
          <aside className="relative order-2 self-start overflow-hidden rounded-panel bg-gradient-to-br from-brand-500 to-brand-400 p-6 text-on-brand shadow-neon sm:p-8 lg:order-1">
            <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[18px] border-white/20" />
            <p className="relative text-xs font-bold uppercase tracking-[0.14em]">{siteConfig.name} account</p>
            <h2 className="relative mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">Shop faster, keep track of every order.</h2>
            <ul className="relative mt-6 space-y-4">
              {BENEFITS.map(({ icon: Icon, title: t, text }) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span>
                    <span className="block text-sm font-bold">{t}</span>
                    <span className="block text-sm">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="relative mt-6 border-t border-ink/15 pt-4 text-sm">
              Prefer not to sign up? You can still <Link href="/products" className="font-bold underline">shop as a guest</Link>.
            </p>
          </aside>
          <div className="order-1 lg:order-2">
            {card}
            {footer && <p className="mt-4 text-center text-sm leading-5 text-muted">{footer}</p>}
          </div>
        </div>
      ) : (
        <>
          {card}
          {footer && <p className="mt-4 text-center text-sm leading-5 text-muted">{footer}</p>}
        </>
      )}
    </div>
  );
}

export function AccountsUnavailableNotice() {
  return (
    <AuthCard
      title="Accounts are unavailable"
      intro="Customer accounts are not available right now. You can still shop and check out as a guest."
    >
      <div className="flex flex-wrap gap-3">
        <Link href="/products" className="btn-primary">
          Continue shopping
        </Link>
        <Link href="/track-order" className="btn-secondary">
          Track an order
        </Link>
      </div>
    </AuthCard>
  );
}
