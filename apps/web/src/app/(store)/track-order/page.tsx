import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/layout/info-layout";
import { OrderTracker } from "@/components/orders/order-tracker";
import { RecentOrders } from "@/components/orders/recent-orders";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your VOLTA.LK order.",
  alternates: { canonical: "/track-order" },
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <InfoLayout>
      <nav aria-label="Breadcrumbs">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <li><Link href="/" className="inline-flex min-h-6 items-center hover:text-ink">Home</Link></li>
          <li aria-hidden className="text-muted/70">/</li>
          <li><span className="font-semibold text-ink" aria-current="page">Track order</span></li>
        </ol>
      </nav>
      <h1 className="mt-4 text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] font-semibold leading-tight text-ink">Track Your Order</h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">Enter your order reference to see its delivery status and carrier information.</p>
      <div className="mt-6 max-w-2xl">
        {/* key: picking another order (Your recent orders) restarts the tracker with that reference */}
        <OrderTracker key={ref ?? ""} initialRef={ref?.slice(0, 40)} />
      </div>
      <RecentOrders />
    </InfoLayout>
  );
}
