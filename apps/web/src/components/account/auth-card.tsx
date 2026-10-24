import Link from "next/link";

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-8">
      <div className="card p-6 shadow-card sm:p-8">
        <h1 className="page-title">{title}</h1>
        {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
    </div>
  );
}

export function AccountsUnavailableNotice() {
  return (
    <AuthCard title="Accounts are unavailable" intro="Customer accounts are not available right now. You can still shop and check out as a guest.">
      <div className="flex flex-wrap gap-3">
        <Link href="/products" className="btn-primary">Continue shopping</Link>
        <Link href="/track-order" className="btn-secondary">Track an order</Link>
      </div>
    </AuthCard>
  );
}
