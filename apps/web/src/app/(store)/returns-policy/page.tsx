import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/layout/policy-page";

export const metadata: Metadata = { title: "Returns policy", alternates: { canonical: "/returns-policy" } };

export default function ReturnsPage() {
  return (
    <PolicyPage title="Returns policy" intro="How returns are handled.">
      <section>
        <h2>How returns work</h2>
        <p>Returns are processed manually by our team. Processing a return does not change the status shown on the Track order page, and refunds are not issued automatically. <Link href="/contact" className="font-medium text-brand-600 underline">Contact us</Link> to arrange a return.</p>
      </section>
      <section>
        <h2>Return conditions</h2>
        <p>Return eligibility periods and conditions are set by the business and must be added here before launch.</p>
      </section>
    </PolicyPage>
  );
}
