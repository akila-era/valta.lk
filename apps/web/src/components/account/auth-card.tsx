import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";

/** Sign-in style pages (sign in, register, password reset): a clean white card with warm accents, ambient orange glow, and pill breadcrumbs. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 flex justify-center">
        <ol className="flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3.5 py-1.5 text-xs text-muted shadow-soft">
          <li>
            <Link href="/" className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <span className="text-muted">Account</span>
          </li>
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <span className="font-semibold text-brand-600" aria-current="page">
              {title}
            </span>
          </li>
        </ol>
      </nav>

      {/* Floating Card */}
      <div className="relative">
        {/* Glow Effects */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-16 -z-10 aspect-square w-[140%] -translate-x-1/2 rounded-full border border-brand-500/20 [transform:perspective(900px)_rotateX(74deg)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-10 -z-10 h-60 w-60 rounded-full bg-brand-500/15 blur-3xl"
        />

        <div className="relative rounded-3xl border border-border/80 bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-4 inline-flex items-center justify-center">
            <Icon3D icon={UserRound} size="lg" />
          </div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
            ACCOUNT / VOLTA.LK
          </p>
          <h1 className="statement mt-2 text-2xl leading-tight text-ink">
            {title}
          </h1>
          {intro && <p className="mt-2 text-sm leading-6 text-muted">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && (
          <p className="mt-5 text-center text-xs leading-5 text-muted sm:text-sm">
            {footer}
          </p>
        )}
      </div>
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
        <Link href="/products" className="btn-primary rounded-full px-5 py-2.5 text-xs">
          Continue shopping
        </Link>
        <Link href="/track-order" className="btn-secondary rounded-full px-5 py-2.5 text-xs">
          Track an order
        </Link>
      </div>
    </AuthCard>
  );
}
