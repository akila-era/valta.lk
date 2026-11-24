import type { Metadata } from "next";
import Link from "next/link";
import { EditablePage } from "@/components/layout/editable-page";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "Warranty & refund policy", alternates: { canonical: "/warranty-policy" } };

/** Warranty & refund policy (as on ugreen.lk). Starter text only states what the site really does; staff replace it in the admin. */
export default function WarrantyPolicyPage() {
  return (
    <EditablePage slug="warranty-policy">
      <PolicyPage title="Warranty & refund policy" intro="How warranty claims and refunds are handled for orders from VOLTA.LK.">
        <section>
          <h2>Warranty</h2>
          <p>The warranty for a product, when it has one, is shown on its product page. Keep your order reference: we use it to find your purchase when you make a claim.</p>
        </section>
        <section>
          <h2>Making a claim</h2>
          <p>
            Please <Link href="/contact">contact us</Link> with your order reference and a short description of the problem. Our team will tell you the next steps.
          </p>
        </section>
        <section>
          <h2>Refunds</h2>
          <p>Refunds are arranged by our team and are not automatic. See also our <Link href="/returns-policy">returns policy</Link>.</p>
        </section>
      </PolicyPage>
    </EditablePage>
  );
}
