import type { Metadata } from "next";
import { OrderTracker } from "@/components/orders/order-tracker";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your VALTA.LK order.",
  alternates: { canonical: "/track-order" },
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <StoreHeroBanner
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Track order" }]}
        section="ORDERS"
        label="TRACKING"
        title="Track Your Order"
        intro="Enter your order reference code to track live delivery status and carrier information."
        categoryName="accessories"
        tagline="Live Delivery Tracking"
      />
      <div className="mx-auto max-w-2xl">
        <OrderTracker initialRef={ref?.slice(0, 40)} />
      </div>
    </>
  );
}
