import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

// Body text, tight display headings and a mono face for small technical labels (eyebrows, SKUs, step numbers).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", weight: ["500", "600", "700", "800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "VOLTA.LK | Mobile phones, electronics & accessories", template: "%s | VOLTA.LK" },
  description: siteConfig.description,
  openGraph: { siteName: "VOLTA.LK", type: "website", locale: "en_LK" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

/**
 * Some antivirus browser extensions (Bitdefender) stamp a bis_skin_checked="1" attribute on every <div> before React
 * hydrates, which React reports as a hydration mismatch on every page. This removes just that one attribute as soon
 * as it appears, so any other mismatch (a real bug) is still reported.
 */
const STRIP_EXTENSION_ATTRS = `(()=>{const a="bis_skin_checked";const clean=(n)=>{if(n.nodeType===1){n.removeAttribute(a);n.querySelectorAll("["+a+"]").forEach((e)=>e.removeAttribute(a));}};new MutationObserver((ms)=>{for(const m of ms){if(m.type==="attributes")m.target.removeAttribute(a);else m.addedNodes.forEach(clean);}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:[a]});clean(document.documentElement);})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: STRIP_EXTENSION_ATTRS }} />
      </head>
      {/* Browser extensions such as Grammarly add attributes to <body>; ignore only that mismatch. */}
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
