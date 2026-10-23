import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/checkout", "/order-confirmation/", "/search", "/admin/"] }],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
