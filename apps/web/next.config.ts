import type { NextConfig } from "next";

/**
 * The microphone stays blocked for the whole site (as before) UNLESS voice input for the AI assistant is switched on with
 * AI_ASSISTANT_VOICE=stt: then only this site's own pages may ask for it (the browser still asks the shopper). The header is fixed when
 * the site is built, so the variable must be present at build time as well as at run time.
 */
const microphone = (process.env.AI_ASSISTANT_VOICE ?? "").toLowerCase().split(",").map((v) => v.trim()).includes("stt") ? "microphone=(self)" : "microphone=()";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: `camera=(), ${microphone}, geolocation=()` },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

function imageHosts(): { protocol: "http" | "https"; hostname: string; port?: string }[] {
  const patterns: { protocol: "http" | "https"; hostname: string; port?: string }[] = [];
  for (const host of (process.env.ERP_IMAGE_HOSTS ?? "").split(",")) {
    const hostname = host.trim();
    if (hostname) patterns.push({ protocol: "https", hostname });
  }
  const base = process.env.HX_API_BASE?.trim();
  if (base) {
    try {
      const url = new URL(base);
      patterns.push({
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
      });
    } catch {
      /* An unreadable ERP address must not stop the site from building. */
    }
  }
  return patterns;
}

const nextConfig: NextConfig = {
  // E2E builds use their own folder so they never clobber a running dev server's .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // The WhatsApp Web client (QR linking) and its logger run as plain Node packages, not bundled.
  serverExternalPackages: ["@whiskeysockets/baileys", "pino"],
  // The dev-only "N" badge sat on top of the service bar; build errors still show in the overlay.
  devIndicators: false,
  images: {
    // Product images are served from hosts listed in ERP_IMAGE_HOSTS (comma separated).
    remotePatterns: imageHosts(),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
