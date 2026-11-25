import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("returns-policy");

export default function ReturnsPolicyPage() {
  return <InfoPageView slug="returns-policy" />;
}
