import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalNotice, PolicyPage } from "@/components/layout/policy-page";

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
        <ApprovalNotice>
          <p className="!text-warn">
            The return period, which items are eligible, the condition they must be in and the refund process have not been approved for publication, so this page does not state any. Until the business publishes them,{" "}
            <Link href="/contact">contact us</Link> before sending anything back.
          </p>
        </ApprovalNotice>
      </section>
    </PolicyPage>
  );
}
