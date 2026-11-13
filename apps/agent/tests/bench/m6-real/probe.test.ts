import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { createMockStack } from "../../../src/mock/stack";
import { renderTemplate } from "../../../src/router/templates";
import { run } from "../../fixtures/pipeline-helpers";
import { emptySite, loadSnapshot, SnapshotTransport } from "./snapshot";

/**
 * Manual probe (skipped unless REAL_CATALOGUE_JSON and REAL_PROBE_OUT are set): runs conversations against the REAL catalogue snapshot and writes what
 * the assistant answered, so the answers can be compared with the data by eye. Not part of the normal run. Conversations are separated by "||", turns by "|".
 */
const JSON_PATH = process.env.REAL_CATALOGUE_JSON;
const OUT = process.env.REAL_PROBE_OUT;

const CONVERSATIONS: string[] = (process.env.REAL_PROBE_ONLY ? process.env.REAL_PROBE_ONLY.split("||") : [
  "show me phones",
  "phones under 50000",
  "show me Apple phones",
  "iphone ekak oni",
  "apple products under 1500",
  "I want a phone with a good camera",
  "gaming phone under 5000",
  "phone with the best battery",
  "laptop for programming under 300000",
  "laptop for office work",
  "Samsung hodaida?",
  "is Samsung good?",
  "show me Xiaomi phones",
  "compare 11 pro and 13",
  "what is the best value phone",
  "a phone for under 500",
  "cheapest phone",
  "most expensive phone",
  "show me watches",
  "do you have a charger",
  "show me phones|1500|camera",
  "show me Apple phones|is the first one worth it?|tell me about the second one",
  "phone ekak pennanna|2000 ta adu|camera",
  "මට phone එකක් ඕන|2000 ට අඩු",
]);

it.runIf(JSON_PATH && OUT)("real catalogue probe", async () => {
  const snap = loadSnapshot(JSON_PATH!);
  const lines: string[] = [`real catalogue snapshot: ${snap.count} products`, ""];
  for (const conv of CONVERSATIONS) {
    const s = createMockStack({ transport: new SnapshotTransport(snap), site: emptySite(), catalogueTtlMs: 0 });
    lines.push(`=== ${conv}`);
    for (const turn of conv.split("|")) {
      const { result } = await run(s.pipeline, turn);
      const known = new Map<string, string>();
      for (const k of ["tools_ran", "recommend_intro", "recommend_limited_data", "no_match_alternatives", "brand_advice", "no_results", "opinion_facts", "clarify_what", "clarify_product", "browse_categories", "popular_unavailable", "ask_budget", "ask_usage_phone", "ask_usage_laptop", "ask_brand", "ask_device", "clarify_budget_what", "no_accessories", "clarify_accessory_for"] as const) known.set(renderTemplate(k, "en").text, k);
      const parts = result.reply.text.split("\n\n").map((p) => known.get(p) ?? (renderTemplate("clarify_what", "si").text === p ? "clarify_what(si)" : "(other template)"));
      lines.push(`  > ${turn}`, `    reply: ${parts.join(" + ")}`);
      for (const c of result.cards) {
        if (c.type === "product") lines.push(`    card: ${c.name} | ${c.brand ?? "-"} | ${c.price.text} | ${c.available ? "in stock" : "out of stock"} | fit=${c.fit ? JSON.stringify(c.fit) : "none"}`);
        else lines.push(`    card: ${c.type}`);
      }
      if (result.cards.length === 0) lines.push("    cards: none");
    }
  }
  writeFileSync(OUT!, lines.join("\n"));
});
