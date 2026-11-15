import { beforeAll, describe, expect, it } from "vitest";
import { createMockStack } from "../../src/mock/stack";
import { createLlmTools, LlmToolExecutor, type LlmToolDeps, type TurnInit } from "../../src/tools/llm";
import { richById, richPrice, RichTransport, richSite } from "../fixtures/rich-catalogue";

/**
 * The model-facing tools against the REAL shop tool registry (on the invented fixture catalogue): every price, availability and proposal comes from the shop
 * backend, results are evidence the verifier can check, and nothing the model sends can change who is asking.
 */
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("outbound network call in a unit test");
  }) as typeof fetch;
});

const stack = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });
const deps: LlmToolDeps = { registry: stack.registry };
const init = (extra: Partial<TurnInit> = {}): TurnInit => ({ actor: { kind: "guest" }, requestId: "req_t", sessionKey: "s1", deps, ...extra });
const call = (name: string, args: unknown) => ({ function: { name, arguments: args } });
const run = async (name: string, args: unknown, extra: Partial<TurnInit> = {}, enabled?: string[]) => {
  const ex = new LlmToolExecutor({ tools: createLlmTools(), ...(enabled ? { enabled } : {}) });
  const turn = ex.startTurn(init(extra));
  const round = await ex.runRound(turn, [call(name, args)]);
  return { turn, result: round.results[0]! };
};
const payload = (modelText: string): Record<string, unknown> => {
  const body = modelText.split("\n").slice(1, -1).join("\n");
  return JSON.parse(body.replace(/ \[truncated\]$/, "")) as Record<string, unknown>;
};

describe("volta_search_products", () => {
  it("returns products with the shop's prices (LKR), availability and specs, as evidence", async () => {
    const { result } = await run("volta_search_products", { query: "Lumen", category: undefined });
    expect(result.status).toBe("ok");
    const data = payload(result.modelText) as { total: number; shown: number; products: { id: string; name: string; priceLkr: number; effectiveLkr: number; available: boolean }[] };
    expect(data.products.length).toBeGreaterThan(0);
    for (const p of data.products) {
      expect(p.name).toMatch(/lumen/i);
      expect(p.effectiveLkr).toBe(richPrice(p.id));
    }
    expect(result.evidence.every((e) => e.kind === "product" && e.tool === "volta_search_products")).toBe(true);
    expect(result.evidence).toHaveLength(data.products.length);
  });

  it("shows the sale price as the effective price and keeps the list price", async () => {
    const { result } = await run("volta_search_products", { query: "Zenix Z9" });
    const data = payload(result.modelText) as { products: { id: string; priceLkr: number; saleLkr: number | null; effectiveLkr: number }[] };
    const z9 = data.products.find((p) => p.id === "ph06")!;
    expect(z9).toMatchObject({ priceLkr: 139900, saleLkr: 129900, effectiveLkr: 129900 });
  });

  it("respects the limit and the budget filters", async () => {
    const { result } = await run("volta_search_products", { category: "mobile-phones", maxPriceLkr: 50000, limit: 2 });
    const data = payload(result.modelText) as { shown: number; products: { effectiveLkr: number }[] };
    expect(data.shown).toBeLessThanOrEqual(2);
    for (const p of data.products) expect(p.effectiveLkr).toBeLessThanOrEqual(50000);
  });

  it("refuses arguments outside the schema (limit above 8, control characters, negative price)", async () => {
    expect((await run("volta_search_products", { limit: 50 })).result.status).toBe("invalid_args");
    expect((await run("volta_search_products", { query: "lumen\u0000" })).result.status).toBe("invalid_args");
    expect((await run("volta_search_products", { minPriceLkr: -1 })).result.status).toBe("invalid_args");
  });

  it("marks catalogue text as untrusted data (a product name can contain anything)", async () => {
    const { result } = await run("volta_search_products", { query: "Lumen" });
    expect(result.modelText).toMatch(/^<<<UNTRUSTED_DATA id=[0-9a-f]{12} source=volta_search_products/);
  });
});

describe("volta_product_details", () => {
  it("returns one product with its specifications and states that the description is withheld", async () => {
    const { result } = await run("volta_product_details", { productId: "ph01" });
    expect(result.status).toBe("ok");
    const data = payload(result.modelText) as { id: string; name: string; effectiveLkr: number; specs: { name: string; value: string }[]; descriptionWithheld: boolean };
    expect(data.id).toBe("ph01");
    expect(data.effectiveLkr).toBe(richPrice("ph01"));
    expect(data.descriptionWithheld).toBe(true);
    expect(data.specs.map((s) => s.name)).toEqual(expect.arrayContaining(["Camera", "Battery", "RAM"]));
    expect(result.evidence[0]).toMatchObject({ kind: "product", productIds: ["ph01"] });
  });

  it("an unknown product is a failure with the shop's own code, not an invented result", async () => {
    const { result, turn } = await run("volta_product_details", { productId: "nope99" });
    expect(result.status).toBe("tool_error");
    expect(result.evidence).toEqual([]);
    expect(turn.evidence).toEqual([]);
    expect(result.modelText).toMatch(/^TOOL_ERROR tool=volta_product_details code=/);
  });

  it("an id with path or query characters is refused before the backend is called", async () => {
    for (const id of ["../admin", "ph01?x=1", "ph01 ", "a".repeat(65), ""]) expect((await run("volta_product_details", { productId: id })).result.status).toBe("invalid_args");
  });
});

describe("volta_stock_and_price", () => {
  it("gives yes/no availability and the price, never a stock count", async () => {
    const { result } = await run("volta_stock_and_price", { productId: "ph01" });
    expect(result.status).toBe("ok");
    const data = payload(result.modelText);
    expect(data.available).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/quantityInStock|stockCount|"stock"/);
    const kinds = result.evidence.map((e) => e.kind).sort();
    expect(kinds).toEqual(["price", "stock"]);
  });

  it("an out-of-stock product is reported as unavailable", async () => {
    const out = richById("ph11");
    expect(out?.stock).toBe(0);
    const { result } = await run("volta_stock_and_price", { productId: "ph11" });
    expect(payload(result.modelText).available).toBe(false);
  });

  it("a requested quantity is checked against the shop", async () => {
    const { result } = await run("volta_stock_and_price", { productId: "ph01", quantity: 2 });
    expect(payload(result.modelText)).toMatchObject({ requestedQuantity: 2 });
    expect((await run("volta_stock_and_price", { productId: "ph01", quantity: 11 })).result.status).toBe("invalid_args");
  });
});

describe("calculator through the executor", () => {
  it("computes 15% of 2400 exactly and records it as calculation evidence", async () => {
    const { result } = await run("calculator", { expression: "15% * 2400" });
    expect(payload(result.modelText)).toMatchObject({ result: "360", exact: true });
    expect(result.evidence[0]).toMatchObject({ kind: "calculation", facts: { result: "360" } });
  });

  it("refuses code, words and anything that is not arithmetic, with a stable code", async () => {
    for (const e of ["process.exit(1)", "require('fs')", "1; 2", "constructor", "__proto__", "import('x')", "alert(1)", "`1+1`"]) {
      const { result } = await run("calculator", { expression: e });
      expect(result.status).toBe("tool_error");
      expect(result.code).toMatch(/^CALC_/);
    }
  });
});

describe("recall_conversation (read only, bounded)", () => {
  it("shows the server's session facts and bounds depth, size and item counts", async () => {
    const session = { budgetLkr: 100000, excludedBrands: ["Samsung"], nested: { a: { b: { c: { d: "too deep" } } } }, long: "x".repeat(5000), many: Array.from({ length: 50 }, (_, i) => i) };
    const { result } = await run("recall_conversation", {}, { session });
    const facts = (payload(result.modelText) as { facts: Record<string, unknown> }).facts;
    expect(facts.budgetLkr).toBe(100000);
    expect(facts.excludedBrands).toEqual(["Samsung"]);
    expect((facts.long as string).length).toBe(200);
    expect((facts.many as number[]).length).toBe(10);
    expect(JSON.stringify(facts.nested)).not.toContain("too deep");
  });

  it("has no way to write: it takes no arguments and the model's keys are dropped", async () => {
    const session = { budgetLkr: 1 };
    const { result } = await run("recall_conversation", { budgetLkr: 999999 }, { session });
    expect(result.audit.droppedFields).toBe(1);
    expect((payload(result.modelText) as { facts: { budgetLkr: number } }).facts.budgetLkr).toBe(1);
    expect(session.budgetLkr).toBe(1);
  });
});

describe("propose_cart_change (class 'proposal': changes nothing, the shopper confirms in the browser)", () => {
  const enabled = ["propose_cart_change"];
  it("add: returns a proposal action and tells the model nothing was added", async () => {
    const { result, turn } = await run("propose_cart_change", { action: "add", productId: "ph01", quantity: 2 }, { cart: [] }, enabled);
    expect(result.status).toBe("ok");
    expect(result.proposal).toMatchObject({ type: "cart.add", productId: "ph01", quantity: 2, confirm: "ask" });
    expect(turn.proposals).toHaveLength(1);
    const data = payload(result.modelText);
    expect(data).toMatchObject({ status: "proposal_pending_confirmation", appliedToCart: false, requiresShopperConfirmation: true });
    expect(String(data.say)).toMatch(/Do not say it has been added/);
    expect(result.evidence).toEqual([]); // a proposal proves nothing about the cart
  });

  it("adding to a line already in the cart becomes a quantity change (the browser never double-applies)", async () => {
    const { result } = await run("propose_cart_change", { action: "add", productId: "ph01", quantity: 1 }, { cart: [{ productId: "ph01", variantKey: "", quantity: 2 }] }, enabled);
    expect(result.proposal).toMatchObject({ type: "cart.setQuantity", quantity: 3 });
  });

  it("update needs a quantity and a line that exists", async () => {
    expect((await run("propose_cart_change", { action: "update", productId: "ph01" }, { cart: [] }, enabled)).result.code).toBe("QUANTITY_REQUIRED");
    expect((await run("propose_cart_change", { action: "update", productId: "ph01", quantity: 2 }, { cart: [] }, enabled)).result.code).toBe("NOT_IN_CART");
    const ok = await run("propose_cart_change", { action: "update", productId: "ph01", quantity: 3 }, { cart: [{ productId: "ph01", variantKey: "", quantity: 1 }] }, enabled);
    expect(ok.result.proposal).toMatchObject({ type: "cart.setQuantity", quantity: 3 });
  });

  it("remove works on a line in the cart and fails honestly otherwise", async () => {
    const ok = await run("propose_cart_change", { action: "remove", productId: "ph01" }, { cart: [{ productId: "ph01", variantKey: "", quantity: 1 }] }, enabled);
    expect(ok.result.proposal).toMatchObject({ type: "cart.remove", productId: "ph01" });
    expect((await run("propose_cart_change", { action: "remove", productId: "ph01" }, { cart: [] }, enabled)).result.status).toBe("tool_error");
  });

  it("an out-of-stock product cannot even be proposed", async () => {
    const r = await run("propose_cart_change", { action: "add", productId: "ph11", quantity: 1 }, { cart: [] }, enabled);
    expect(r.result.code).toBe("OUT_OF_STOCK");
    expect(r.turn.proposals).toEqual([]);
  });

  it("is refused when the lane does not enable it, and checkout or payment are not reachable from any tool", async () => {
    const off = await run("propose_cart_change", { action: "add", productId: "ph01" }, { cart: [] });
    expect(off.result.status).toBe("not_enabled");
    const names = createLlmTools().map((t) => t.name);
    expect(names.some((n) => /checkout|payment|pay|place_order|order_place/.test(n))).toBe(false);
  });

  it("the model cannot choose a different customer's cart: the cart is the browser snapshot the server passed, never an argument", async () => {
    const { result } = await run("propose_cart_change", { action: "update", productId: "ph01", quantity: 2, cart: [{ productId: "ph01", variantKey: "", quantity: 1 }] }, { cart: [] }, enabled);
    expect(result.code).toBe("NOT_IN_CART");
    expect(result.audit.droppedFields).toBe(1);
  });
});

describe("disabled order tools", () => {
  it.each(["get_order_status", "get_order_history"])("%s says why it is not available and exposes no order data", async (name) => {
    const ex = new LlmToolExecutor({ tools: createLlmTools(), enabled: [name] });
    const turn = ex.startTurn(init({ actor: { kind: "customer", customerId: "cust_1" } }));
    const r = (await ex.runRound(turn, [call(name, {})])).results[0]!;
    expect(r.status).toBe("not_enabled");
    expect(r.modelText).not.toMatch(/order[_ ]?(id|ref)[:= ]?[A-Z0-9-]{4,}/i);
  });
  it("their own execute() also refuses (defence in depth: even if a lane bypassed the executor)", async () => {
    const t = createLlmTools().find((x) => x.name === "get_order_history")!;
    const r = await t.execute({}, { actor: { kind: "customer", customerId: "c" }, requestId: "r", sessionKey: "s", signal: new AbortController().signal, session: {}, turn: { results: new Map(), fetchedPages: 0, nextResultNumber: 1 }, deps, now: Date.now });
    expect(r).toMatchObject({ ok: false, code: "NOT_ENABLED" });
  });
});
