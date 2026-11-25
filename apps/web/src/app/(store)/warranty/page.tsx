import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("warranty");

export default function WarrantyPage() {
  return <InfoPageView slug="warranty" />;
}
