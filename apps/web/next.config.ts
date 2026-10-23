import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
