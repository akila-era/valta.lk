import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "VOLTA.LK | Mobile phones, electronics & accessories", template: "%s | VOLTA.LK" },
  description: siteConfig.description,
  openGraph: { siteName: "VOLTA.LK", type: "website", locale: "en_LK" },
};

// viewportFit "cover" lets fixed bars use the safe-area insets (notch / home indicator) instead of being cut off by them.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      {/* Browser extensions such as Grammarly add attributes to <body>; ignore only that mismatch. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
