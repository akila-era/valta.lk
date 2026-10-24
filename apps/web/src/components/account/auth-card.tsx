import Link from "next/link";
import { UserRound } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { accentize } from "@/components/ui/page-intro";

/** Sign-in style pages (sign in, register, password reset): a glass card raised over a tilted orange orbit, with a 3D icon tile above the title. */
export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-md py-4 sm:py-8">
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-16 -z-10 aspect-square w-[150%] -translate-x-1/2 rounded-full border border-brand-500/25 [transform:perspective(900px)_rotateX(74deg)]" />
      <span aria-hidden className="pointer-events-none absolute -right-16 top-0 -z-10 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="group card relative bg-white/90 p-6 shadow-float backdrop-blur sm:p-8">
        <Icon3D icon={UserRound} size="lg" className="mb-5" />
        <p className="kicker"><span className="text-brand-600">Account</span> / VALTA.LK</p>
        <h1 className="statement mt-2 text-[clamp(2rem,1.6rem+1.6vw,2.75rem)]">{accentize(title)}</h1>
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
