import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "Shipping policy", alternates: { canonical: "/shipping-policy" } };

export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping policy" intro="How delivery works for VALTA.LK orders.">
      <section>
        <h2>Delivery charge</h2>
        <p>The delivery charge is shown at checkout before you place your order.</p>
      </section>
      <section>
        <h2>Tracking</h2>
        <p>Once your order is dispatched, the carrier and tracking number (when available) appear on the Track order page. We do not promise specific delivery times on this website.</p>
      </section>
      <section>
        <h2>Cash on delivery</h2>
        <p>Please have the payment ready when your order arrives.</p>
      </section>
    </PolicyPage>
  );
}
