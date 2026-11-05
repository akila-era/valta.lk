import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";
import { WholesaleForm } from "@/components/layout/wholesale-form";
import { SimpleText } from "@/components/ui/simple-text";
import { getPage } from "@/lib/site-content";

export const metadata: Metadata = { title: "Apply for wholesale", alternates: { canonical: "/wholesale" } };

/**
 * "Apply Wholesale" (as on ugreen.lk): businesses send their details and our team contacts them. Staff can write the
 * title, intro and a "why partner with us" text above the form in the admin (Content, Pages, Apply for wholesale).
 */
export default async function WholesalePage() {
  const saved = await getPage("wholesale");
  return (
    <PolicyPage
      title={saved?.title || "Apply for wholesale"}
      intro={saved ? saved.intro || undefined : "Buying for a shop or a business? Send your details and our team will contact you about wholesale prices."}
    >
      {saved?.body ? (
        <section>
          <SimpleText text={saved.body} />
        </section>
      ) : null}
      <section>
        <h2>Register here</h2>
        <WholesaleForm />
      </section>
    </PolicyPage>
  );
}
