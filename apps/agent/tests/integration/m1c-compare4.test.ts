import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../../src/auth/hmac";
import { cardForVersion } from "../../src/contract/compat";
import { Card, ChatResponse, CONTRACT_VERSION } from "../../src/contract/schemas";
import { loadConfig } from "../../src/config";
import { createAgentServer, type RunningServer } from "../../src/http/server";
import { FixtureErpTransport } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { runToolCalls } from "../../src/tools/runner";
import { run } from "../fixtures/pipeline-helpers";

type Cmp = Extract<Card, { type: "comparison" }>;
const MSG = {
  2: "Compare Nova X1 and Orbit Pro",
  3: "Compare Nova X1, Orbit Pro and Atlas Smartwatch",
  4: "Compare Nova X1, Orbit Pro, Atlas Smartwatch and Zen Book 14 Laptop",
} as const;

describe("comparison of 2, 3 and 4 products through the pipeline", () => {
  for (const n of [2, 3, 4] as const) {
    it(`${n} products: one comparison card with ${n} columns in every row, from backend data only`, async () => {
      const s = createMockStack({ transport: new FixtureErpTransport() });
      const { result } = await run(s.pipeline, MSG[n]);
      expect(result.cards.map((c) => c.type)).toEqual(["comparison"]);
      const card = result.cards[0] as Cmp;
      expect(card.products).toHaveLength(n);
      for (const r of card.rows) expect(r.values, r.label).toHaveLength(n);
      expect(Card.safeParse(card).success).toBe(true);
      expect(result.reply.text).not.toMatch(/\d/);
    });
  }

  it("shows a specification a product does not have as null, never an invented value", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const card = (await run(s.pipeline, MSG[4])).result.cards[0] as Cmp;
    const memory = card.rows.find((r) => r.label === "Memory");
    expect(memory?.values.filter((v) => v !== null)).toEqual(["16 GB"]); // only the laptop has it
    expect(memory?.values.filter((v) => v === null)).toHaveLength(3);
    expect(memory?.differs).toBe(true);
    const spread = card.priceDelta; // 289,900 laptop minus 34,900 watch
    expect(spread).toMatchObject({ text: "Rs. 255,000.00" });
  });

  it("rejects one product and more than four at the tool, so nothing runs", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const ctx = { actor: { kind: "guest" as const }, requestId: "r", signal: new AbortController().signal, cart: [] };
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `cm0item${String(i + 1).padStart(8, "0")}`);
    for (const n of [0, 1, 5, 6]) {
      const [out] = await runToolCalls(s.registry, [{ name: "compare_products", arguments: { productIds: ids(n) } }], ctx);
      expect(out?.status, String(n)).not.toBe("ok");
    }
    expect(s.transport.calls).toEqual({ list: 0, product: 0, settings: 0, order: 0 });
  });
});

describe("older (1.0) clients", () => {
  const fourCard = async () => (await run(createMockStack({ transport: new FixtureErpTransport() }).pipeline, MSG[4])).result.cards[0] as Cmp;

  it("get a 4-product comparison cut to 3 with rows and the price difference recomputed from what remains", async () => {
    const card = await fourCard();
    const cut = cardForVersion(card, "1") as Cmp;
    expect(cut.products.map((p) => p.name)).toEqual(card.products.slice(0, 3).map((p) => p.name));
    for (const r of cut.rows) expect(r.values).toHaveLength(3);
    expect(Card.safeParse(cut).success).toBe(true);
    // The laptop (4th) was cut, so the memory row no longer differs and the spread is between the first three only.
    expect(cut.rows.find((r) => r.label === "Memory")?.values.every((v) => v === null)).toBe(true);
    expect(cut.rows.find((r) => r.label === "Memory")?.differs).toBe(false);
    expect(cut.priceDelta).toMatchObject({ text: "Rs. 165,000.00" }); // 199,900 minus 34,900
    expect(JSON.stringify(cut)).not.toContain("Zen Book");
  });

  it("leave 2 and 3 product comparisons and every other card unchanged, and 1.1 clients get all four", async () => {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    for (const n of [2, 3] as const) {
      const c = (await run(s.pipeline, MSG[n])).result.cards[0]!;
      expect(cardForVersion(c, "1")).toEqual(c);
    }
    const four = await fourCard();
    expect(cardForVersion(four, "1.1")).toEqual(four);
    const other = (await run(s.pipeline, "Tell me about the Orbit Pro")).result.cards[0]!;
    expect(cardForVersion(other, "1")).toEqual(other);
  });
});

describe("contract version negotiation over HTTP", () => {
  let app: RunningServer | undefined;
  afterEach(async () => {
    await app?.close();
  });
  const SECRET = "t".repeat(40);
  const SID = "sess_0123456789abcdef";
  async function start() {
    const s = createMockStack({ transport: new FixtureErpTransport() });
    const config = loadConfig({ AGENT_HMAC_KEYS: `k1:${SECRET}`, AGENT_PORT: "0", AI_ASSISTANT_ENABLED: "true" });
    app = createAgentServer({ config, pipeline: s.pipeline, memory: async () => ({ availableMb: null, swapUsedMb: null }) });
    return `http://127.0.0.1:${(await app.listen()).port}`;
  }
  const post = (url: string, body: unknown, path = "/v1/chat") => {
    const raw = JSON.stringify(body);
    return fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json", ...signRequest({ keyId: "k1", secret: SECRET, method: "POST", path, identity: { kind: "guest" }, clientIp: "203.0.113.7", body: raw }) }, body: raw });
  };

  it("serves 1.0 to a client that names no version (3 products, meta 1) and 1.1 to a client that asks for it (4 products, meta 1.1)", async () => {
    const url = await start();
    const legacy = (await (await post(url, { sessionId: SID, message: MSG[4] })).json()) as { cards: Cmp[]; meta: { contractVersion: string } };
    expect(ChatResponse.safeParse(legacy).success).toBe(true);
    expect(legacy.meta.contractVersion).toBe("1");
    expect(legacy.cards[0]!.products).toHaveLength(3);
    const current = (await (await post(url, { sessionId: SID, message: MSG[4], contractVersion: CONTRACT_VERSION })).json()) as { cards: Cmp[]; meta: { contractVersion: string } };
    expect(ChatResponse.safeParse(current).success).toBe(true);
    expect(current.meta.contractVersion).toBe("1.1");
    expect(current.cards[0]!.products).toHaveLength(4);
  });

  it("applies the same rule to streamed cards", async () => {
    const url = await start();
    const text = async (body: unknown) => (await post(url, body, "/v1/chat/stream")).text();
    const cardsOf = (t: string) => t.split("\n\n").filter((b) => b.startsWith("event: card")).map((b) => JSON.parse(b.split("data: ")[1]!) as Cmp);
    expect(cardsOf(await text({ sessionId: SID, message: MSG[4] }))[0]!.products).toHaveLength(3);
    expect(cardsOf(await text({ sessionId: SID, message: MSG[4], contractVersion: "1.1" }))[0]!.products).toHaveLength(4);
  });

  it("rejects an unsupported version as a validation error and runs nothing", async () => {
    const url = await start();
    const res = await post(url, { sessionId: SID, message: MSG[2], contractVersion: "2" });
    expect(res.status).toBe(422);
  });
});
