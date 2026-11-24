import { describe, expect, it } from "vitest";
import { FIT_LABELS } from "@/components/assistant/labels";
import { AGENT_CONTRACT_VERSION, AgentChatResponse, FIT_REASONS, FIT_TRADEOFFS } from "@/lib/assistant/schema";

const card = (fit: unknown) => ({
  type: "product",
  id: "p1",
  slug: "p1",
  name: "Test phone",
  price: { amount: 1000, text: "Rs. 1,000.00" },
  available: true,
  url: "/products/p1",
  ...(fit === undefined ? {} : { fit }),
});
const response = (c: unknown) => ({
  requestId: "req_1",
  sessionId: "sess_x",
  language: "en",
  reply: { text: "Based on what you've told me, these look like the best fits.", source: "template" },
  needsNativeReview: false,
  cards: [c],
  actions: [],
  suggestions: [],
  meta: { model: null, degraded: false, queuedMs: 0, latencyMs: 1, contractVersion: AGENT_CONTRACT_VERSION },
});

describe("contract 1.2: fit codes on product cards", () => {
  it("speaks contract 1.2 and accepts a card with known fit codes (or none)", () => {
    expect(AGENT_CONTRACT_VERSION).toBe("1.2");
    expect(AgentChatResponse.safeParse(response(card({ reasons: ["within_budget", "best_camera"], tradeoffs: ["no_battery_data"] }))).success).toBe(true);
    expect(AgentChatResponse.safeParse(response(card(undefined))).success).toBe(true);
  });

  it("rejects an unknown code, too many codes and extra fields: the Agent cannot smuggle free text through fit", () => {
    expect(AgentChatResponse.safeParse(response(card({ reasons: ["this phone is the best ever"], tradeoffs: [] }))).success).toBe(false);
    expect(AgentChatResponse.safeParse(response(card({ reasons: ["within_budget", "brand_match", "best_camera", "lowest_price"], tradeoffs: [] }))).success).toBe(false);
    expect(AgentChatResponse.safeParse(response(card({ reasons: [], tradeoffs: [], note: "buy it" }))).success).toBe(false);
  });

  it("has wording in English and Sinhala for every code the contract allows, and none for anything else", () => {
    for (const lang of ["en", "si"] as const) {
      for (const code of [...FIT_REASONS, ...FIT_TRADEOFFS]) expect(FIT_LABELS[lang][code], `${lang}:${code}`).toBeTruthy();
      expect(Object.keys(FIT_LABELS[lang]).sort()).toEqual([...FIT_REASONS, ...FIT_TRADEOFFS].sort());
    }
  });

  it("a claim of fit never shows digits or currency that the Agent could have invented (labels are fixed text)", () => {
    for (const lang of ["en", "si"] as const) for (const text of Object.values(FIT_LABELS[lang])) expect(text).not.toMatch(/\d|Rs\.|LKR/);
  });
});
