import type { Metadata } from "next";
import { OrderTracker } from "@/components/orders/order-tracker";
import { PageIntro } from "@/components/ui/page-intro";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your VALTA.LK order.",
  alternates: { canonical: "/track-order" },
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <PageIntro section="Orders" label="Tracking" title="Track your order" intro="Enter the reference from your confirmation. This page shows the order status the store has on record. It does not show another customer’s delivery details." />
      <OrderTracker initialRef={ref?.slice(0, 40)} />
    </>
  );
}
