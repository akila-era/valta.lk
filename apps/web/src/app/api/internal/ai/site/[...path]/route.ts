import { readCatalogueAuthConfig, verifyCatalogueRequest } from "@/lib/assistant/catalogue-auth";
import { AI_SITE_PAGES, htmlToPlainText } from "@/lib/assistant/site-text";
import { getInstalmentSettings } from "@/lib/instalments";
import { errorResponse, json } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rate-limit";
import { PAYMENT_BADGES, getStoreInfo } from "@/lib/store-info";

export const dynamic = "force-dynamic";

/**
 * Read-only PUBLIC website information for the AI Agent: the store details staff publish (contact, hours, address, payment methods, delivery and pickup notes,
 * instalment providers) and the text of the public pages (about, contact, FAQs, policies, terms, wholesale, track-order help) exactly as a shopper sees them.
 * Same signed key and anonymous identity as the catalogue relay; two GET routes only. Nothing customer-specific, no bank account number (checkout shows it
 * to the shopper; the assistant never repeats account numbers), no write, no order data. Off (404) unless the catalogue relay is enabled.
 */
const notFound = () => errorResponse(404, "NOT_FOUND", "Not found.");
const PAGE_TTL_MS = 60_000;
const g = globalThis as unknown as { __voltaAiSitePages?: Map<string, { at: number; text: string }> };
const pageCache = (g.__voltaAiSitePages ??= new Map());

async function pageText(slug: string): Promise<string | null> {
  const path = AI_SITE_PAGES[slug];
  if (!path) return null;
  const hit = pageCache.get(slug);
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.text;
  // The site reads its own public page over loopback (a fixed path from the list above), so the Agent gets exactly what shoppers see, including staff edits.
  const res = await fetch(`http://127.0.0.1:${process.env.PORT || "3000"}${path}`, { headers: { Accept: "text/html" }, redirect: "error", signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) return null;
  const text = htmlToPlainText((await res.text()).slice(0, 1_500_000));
  if (!text) return null;
  pageCache.set(slug, { at: Date.now(), text });
  return text;
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const cfg = readCatalogueAuthConfig();
  if (!cfg) return notFound();
  const url = new URL(req.url);
  if (!verifyCatalogueRequest({ method: "GET", pathWithQuery: url.pathname + url.search, headers: req.headers }, cfg)) return notFound();
  if (!rateLimit("ai-site", 120, 60_000).ok) return errorResponse(429, "RATE_LIMITED", "Too many requests.");
  if (url.search) return errorResponse(400, "INVALID", "Invalid request.");

  const parts = (await ctx.params).path;
  try {
    if (parts.length === 1 && parts[0] === "info") {
      const [s, inst] = await Promise.all([getStoreInfo(), getInstalmentSettings()]);
      return json({
        success: true,
        data: {
          name: s.topLine,
          phone: s.phone,
          phone2: s.phone2,
          whatsapp: s.whatsapp,
          email: s.email,
          address: s.address,
          hours: s.hours,
          deliveryTime: s.deliveryTime,
          pickupInfo: s.pickupInfo,
          paymentMethods: s.payments.map((p) => PAYMENT_BADGES[p]),
          bankTransferOffered: s.bankAccountNumber !== "",
          instalments: inst.enabled && inst.providers.length ? { providers: inst.providers, parts: inst.parts } : null,
          pages: Object.keys(AI_SITE_PAGES),
        },
      });
    }
    if (parts.length === 2 && parts[0] === "pages" && /^[a-z0-9-]{1,40}$/.test(parts[1]!)) {
      const text = await pageText(parts[1]!);
      if (text === null) return errorResponse(404, "PAGE_NOT_FOUND", "No such page.");
      return json({ success: true, data: { slug: parts[1], path: AI_SITE_PAGES[parts[1]!], text } });
    }
  } catch {
    return errorResponse(503, "SITE_INFO_UNAVAILABLE", "The site information is unavailable.");
  }
  return notFound();
}
