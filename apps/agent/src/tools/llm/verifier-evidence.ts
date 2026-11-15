import type { ToolEvidence as V2Evidence, SpecFact } from "../../verify/v2/types";
import { extractSpecClaims } from "../../verify/v2/specs";
import { fold } from "../../verify/v2/text";
import type { AuditRecord } from "./executor";
import type { ToolEvidence } from "./evidence";

/**
 * Turns what the tool layer produced into what verifier v2 checks an answer against. The two `ToolEvidence` types are NOT the same shape (the tool layer keeps
 * a loose `facts` bag so results stay readable for the model; the verifier wants typed fields), so this is the one place where one becomes the other.
 *
 * Rules: every number comes from the server's own tool result (never from the model); money is converted from LKR to minor units exactly once, here; a
 * specification is only passed on when it can be read as a number with a unit (or a known processor): anything else is dropped, so the verifier treats it
 * as "not listed" rather than as a fact it cannot check.
 */
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.slice(0, max) : undefined);
const minor = (lkr: unknown): number | undefined => {
  const n = num(lkr);
  return n === undefined ? undefined : Math.round(n * 100);
};

/** One catalogue specification row ({name, value}) as verifier facts. `unit` is read from the value text ("8 GB", "5000 mAh", "6.7 inch", "Snapdragon 8 Gen 2"). */
export function specRowToFacts(name: string, value: string): SpecFact[] {
  const claims = extractSpecClaims(fold(`${name} ${value}`));
  const out: SpecFact[] = [];
  for (const c of claims) {
    if (c.field === "processor") out.push({ field: "processor", text: c.text ?? value.slice(0, 60) });
    else if (typeof c.value === "number") {
      const unit = c.field === "ram" || c.field === "storage" ? "gb" : c.field === "battery" ? "mah" : c.field === "camera" ? "mp" : c.field === "display" ? "inch" : c.field === "refresh_rate" ? "hz" : c.field === "charging" ? "w" : undefined;
      out.push({ field: c.field, value: c.value, ...(unit ? { unit } : {}) });
    }
  }
  return out;
}

function stockOf(available: unknown, requested?: unknown, canFulfil?: unknown): V2Evidence["stock"] | undefined {
  if (typeof available !== "boolean") return undefined;
  // The shop gives yes/no availability, never a count: no quantity is invented. A requested quantity that cannot be fulfilled is "low stock", not "in stock".
  if (!available) return { status: "out_of_stock" };
  if (typeof requested === "number" && canFulfil === false) return { status: "low_stock" };
  return { status: "in_stock" };
}

export function toVerifierEvidence(evidence: readonly ToolEvidence[]): V2Evidence[] {
  const out: V2Evidence[] = [];
  for (const e of evidence) {
    const f = e.facts ?? {};
    switch (e.kind) {
      case "product":
      case "price":
      case "stock":
      case "spec": {
        const id = str(f.id, 80) ?? str(f.productId, 80) ?? e.productIds?.[0];
        const stock = e.kind === "stock" ? stockOf(f.available, f.requestedQuantity, f.canFulfil) : e.kind === "product" ? stockOf(f.available) : undefined;
        const specs: SpecFact[] = [];
        if (Array.isArray(f.specs)) {
          for (const row of f.specs.slice(0, 20)) {
            const r = row as { name?: unknown; value?: unknown };
            if (typeof r?.name === "string" && typeof r.value === "string") specs.push(...specRowToFacts(r.name, r.value));
          }
        }
        const list = minor(f.priceLkr);
        const effective = minor(f.effectiveLkr) ?? minor(f.saleLkr);
        out.push({
          tool: e.tool,
          kind: e.kind,
          ...(id ? { productId: id } : {}),
          ...(str(f.name, 160) ?? str(e.title, 160) ? { productName: (str(f.name, 160) ?? str(e.title, 160))! } : {}),
          ...(str(f.brand, 80) ? { brand: str(f.brand, 80)! } : {}),
          ...(str(f.category, 80) ? { category: str(f.category, 80)! } : {}),
          currency: "LKR",
          ...(list !== undefined ? { priceMinor: list } : {}),
          ...(effective !== undefined && effective !== list ? { effectivePriceMinor: effective } : {}),
          ...(stock ? { stock } : {}),
          ...(specs.length > 0 ? { specs } : {}),
        });
        break;
      }
      case "calculation": {
        const result = typeof f.result === "string" ? Number(f.result) : num(f.result);
        if (result !== undefined && Number.isFinite(result)) out.push({ tool: e.tool, kind: "calculation", calculation: { result, ...(str(f.expression) ? { expression: str(f.expression)! } : {}) } });
        break;
      }
      case "site_info": {
        const text = str(f.text, 8_000);
        if (text) out.push({ tool: e.tool, kind: "site_info", siteText: text });
        break;
      }
      case "search_source":
      case "page_excerpt": {
        if (!e.sourceUrl) break;
        const excerpt = e.kind === "page_excerpt" ? str(f.text, 8_000) : str(f.snippet, 2_000);
        out.push({
          tool: e.tool,
          kind: e.kind,
          source: { url: e.sourceUrl, ...(e.title ? { title: e.title.slice(0, 200) } : {}), ...(e.fetchedAt ? { fetchedAt: e.fetchedAt } : {}) },
          ...(excerpt ? { excerpt } : {}),
        });
        break;
      }
    }
  }
  return out;
}

/**
 * The value for the verifier's `sourcesFetchedThisTurn`: every web source the SERVER retrieved this turn (a search result and a fetched page both count; the
 * model cannot add one). A fetched page outranks the bare search result for the same URL. The order is the order of the `[n]` markers the model must use.
 */
export function retrievedSources(evidence: readonly ToolEvidence[]): { url: string; title?: string }[] {
  const byUrl = new Map<string, { url: string; title?: string; page: boolean }>();
  for (const e of evidence) {
    if ((e.kind !== "search_source" && e.kind !== "page_excerpt") || !e.sourceUrl) continue;
    const prev = byUrl.get(e.sourceUrl);
    const page = e.kind === "page_excerpt";
    if (prev && (prev.page || !page)) continue;
    byUrl.set(e.sourceUrl, { url: e.sourceUrl, ...(e.title ? { title: e.title } : {}), page });
  }
  return [...byUrl.values()].map(({ url, title }) => ({ url, ...(title ? { title } : {}) }));
}

/** True only when a research tool really ran (status "ok") this turn. A refused, disabled or failed search is not a search: the model may not claim one. */
export function searchRan(audit: readonly AuditRecord[]): boolean {
  return audit.some((a) => a.status === "ok" && (a.tool === "web_search" || a.tool === "lookup_documentation" || a.tool === "fetch_page"));
}
