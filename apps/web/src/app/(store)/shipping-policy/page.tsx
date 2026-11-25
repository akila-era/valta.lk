import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("shipping-policy");

export default function ShippingPolicyPage() {
  return <InfoPageView slug="shipping-policy" />;
}
