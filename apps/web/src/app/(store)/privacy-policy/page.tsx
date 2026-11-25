import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("privacy-policy");

export default function PrivacyPolicyPage() {
  return <InfoPageView slug="privacy-policy" />;
}
