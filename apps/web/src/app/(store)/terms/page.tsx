import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("terms");

export default function TermsPage() {
  return <InfoPageView slug="terms" />;
}
