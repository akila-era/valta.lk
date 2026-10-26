import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy-policy" } };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy" intro="What we collect when you order from VOLTA.LK and how it is used.">
      <section>
        <h2>Information we collect</h2>
        <p>When you place an order we collect your name, phone number, optional email address and delivery address. Your shopping cart is kept only in your browser.</p>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To process, deliver and support your order.</li>
          <li>To let you track your order using your order reference.</li>
        </ul>
      </section>
      <section>
        <h2>Where it is stored</h2>
        <p>Order details are passed securely to our inventory and order management system. This website does not store your payment details because payment is made in cash on delivery.</p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>Contact us using the details on the Contact page to ask about your data. This policy should be reviewed by the business owner and legal adviser before launch.</p>
      </section>
    </PolicyPage>
  );
}
