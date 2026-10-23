import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "About us", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <PolicyPage title="About VALTA.LK" intro="VALTA.LK is a Sri Lankan online store for mobile phones, electronics and accessories.">
      <section>
        <h2>How ordering works</h2>
        <p>Choose your products, enter your delivery details and place your order. Payment is by cash on delivery. Prices and stock availability come directly from our inventory system and are confirmed again when you place your order.</p>
      </section>
      <section>
        <h2>Order tracking</h2>
        <p>Use the reference shown after you order to follow your order on the Track order page.</p>
      </section>
    </PolicyPage>
  );
}
