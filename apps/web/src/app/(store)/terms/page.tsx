import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "Terms & conditions", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms & conditions" intro="By placing an order you agree to the following.">
      <section>
        <h2>Orders and prices</h2>
        <p>All prices are in Sri Lankan rupees (LKR). Prices and availability are confirmed when you place your order. If a price or stock level changes, you will be asked to review your order before it is placed.</p>
      </section>
      <section>
        <h2>Payment</h2>
        <p>Payment is by cash on delivery. Your order is recorded as unpaid until the cash is collected on delivery.</p>
      </section>
      <section>
        <h2>Cancellation</h2>
        <p>You can cancel an order online before it is dispatched. After dispatch, please contact us.</p>
      </section>
      <section>
        <h2>Review notice</h2>
        <p>This text is a starting point and should be reviewed by the business owner and legal adviser before launch.</p>
      </section>
    </PolicyPage>
  );
}
