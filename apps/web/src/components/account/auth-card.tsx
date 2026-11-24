import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";

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
                {on ? <span aria-hidden className="absolute inset-x-6 -bottom-px h-[3px] rounded-t-full bg-brand-500" /> : null}
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
        // As on ugreen.lk: the form on the left; on the right, separated by a thin line, the other choice (Register or
        // Login) with a short line and one button. No card around them.
        <div className="grid gap-10 md:grid-cols-2 md:gap-0">
          <div className="md:border-r md:border-border md:pr-12">
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
            {intro && <p className="mt-1.5 text-sm leading-6 text-muted">{intro}</p>}
            <div className="mt-5">{children}</div>
            {footer && <p className="mt-4 text-sm leading-5 text-muted">{footer}</p>}
          </div>
          <div className="border-t border-border pt-10 text-center md:border-t-0 md:pl-12 md:pt-0">
            {tabs.active === "login" ? (
              <>
                <h2 className="text-2xl font-semibold text-ink">Register</h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
                  Registering for this site lets you see your order status and history, and fills in your details at checkout. Just fill in a few fields and your account is ready.
                </p>
                <Link href={"/account/register" + query} className="mt-6 inline-flex min-h-10 items-center rounded-full bg-surface px-6 text-xs font-bold uppercase tracking-[0.04em] text-ink transition-colors hover:bg-ink hover:text-white">
                  Register
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-ink">Login</h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">Already have an account? Sign in to see your orders and check out faster.</p>
                <Link href={"/account/login" + query} className="mt-6 inline-flex min-h-10 items-center rounded-full bg-surface px-6 text-xs font-bold uppercase tracking-[0.04em] text-ink transition-colors hover:bg-ink hover:text-white">
                  Login
                </Link>
              </>
            )}
            <p className="mt-8 text-sm text-muted">
              Prefer not to sign up? You can still <Link href="/products" className="font-semibold text-brand-600 underline underline-offset-2">shop as a guest</Link>.
            </p>
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
