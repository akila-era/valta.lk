import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function AuthCard({ title, intro, children, footer, icon: Icon }: { title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-8">
      <div className="rounded-3xl bg-surface p-6 sm:p-8">
        {Icon && (
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink">
            <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden />
          </span>
        )}
        <h1 className="page-title">{title}</h1>
        {intro && <p className="mt-3 text-sm leading-6 text-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
    </div>
  );
}

export function AccountsUnavailableNotice() {
  return (
    <AuthCard title="Accounts are unavailable" intro="Customer accounts are not available right now. You can still shop and check out as a guest.">
      <div className="flex gap-3">
        <Link href="/products" className="btn-primary">Continue shopping</Link>
        <Link href="/track-order" className="btn-secondary">Track an order</Link>
      </div>
    </AuthCard>
  );
}
