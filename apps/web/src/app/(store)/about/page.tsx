import { InfoPageView, infoMetadata } from "@/components/layout/info-page-view";

export const dynamic = "force-dynamic";

export const generateMetadata = () => infoMetadata("about");

export default function AboutPage() {
  return <InfoPageView slug="about" />;
}
