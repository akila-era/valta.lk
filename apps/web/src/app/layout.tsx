import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "VALTA.LK | Mobile phones, electronics & accessories", template: "%s | VALTA.LK" },
  description: siteConfig.description,
  openGraph: { siteName: "VALTA.LK", type: "website", locale: "en_LK" },
};

// viewportFit "cover" lets fixed bars use the safe-area insets (notch / home indicator) instead of being cut off by them.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/* Browser extensions such as Grammarly add attributes to <body>; ignore only that mismatch. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
