import type { Metadata } from "next";
import { OrderTracker } from "@/components/orders/order-tracker";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your VALTA.LK order.",
  alternates: { canonical: "/track-order" },
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <h1 className="page-title mb-2">Track your order</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">Enter the reference from your confirmation. This page shows the order status the store has on record. It does not show another customer’s delivery details.</p>
      <OrderTracker initialRef={ref?.slice(0, 40)} />
    </>
  );
}
