import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

// Body text, tight display headings and a mono face for small technical labels (eyebrows, SKUs, step numbers).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", weight: ["500", "600", "700", "800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500", "600"] });
// An elegant italic serif for single accent words in large statements ("Technology that *moves* you.").
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument-serif", display: "swap", weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "VALTA.LK | Mobile phones, electronics & accessories", template: "%s | VALTA.LK" },
  description: siteConfig.description,
  openGraph: { siteName: "VALTA.LK", type: "website", locale: "en_LK" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable} ${serif.variable}`}>
      {/* Browser extensions such as Grammarly add attributes to <body>; ignore only that mismatch. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
