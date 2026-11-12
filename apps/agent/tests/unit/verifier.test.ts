import { describe, expect, it } from "vitest";
import { buildCards } from "../../src/backend/cards";
import type { Card, ClientAction } from "../../src/contract/schemas";
import { MOCK_ORDER_REFS, itemId } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { renderTemplate } from "../../src/router/templates";
import { runToolCalls, type ToolOutcome } from "../../src/tools/runner";
import { verifyResponse, verifyVersionShape, type VerifyFailure, type VerifyInput } from "../../src/verify/verifier";
import { customerCtx, guestCtx } from "../fixtures/pipeline-helpers";

const NOVA = itemId(1);
const ORBIT = itemId(2);
const WATCH = itemId(8);
const ZEN = itemId(16);
const TABLET = itemId(18);

type Call = { name: string; arguments: Record<string, unknown> };
async function run(calls: Call[], who: "guest" | "customer" = "guest", cart: { productId: string; variantKey: string; quantity: number }[] = []) {
  const s = createMockStack();
  const ctx = who === "guest" ? { ...guestCtx(cart) } : { ...customerCtx("cust_1", cart) };
  const outcomes = await runToolCalls(s.registry, calls, ctx);
  const { cards } = buildCards(outcomes);
  const actions: ClientAction[] = [];
  for (const o of outcomes) {
    const d = o.status === "ok" ? (o.data as { kind?: string; clientAction?: ClientAction }) : undefined;
    if (d?.kind === "proposal" && d.clientAction) actions.push(d.clientAction);
  }
  return { outcomes, cards, actions, actor: who };
}

const base = (r: { outcomes: ToolOutcome[]; cards: Card[]; actions: ClientAction[]; actor: "guest" | "customer" }, over: Partial<VerifyInput> = {}): VerifyInput => ({
  actor: r.actor,
  outcomes: r.outcomes,
  cards: r.cards,
  actions: r.actions,
  reply: { text: renderTemplate("tools_ran", "en").text, source: "template" },
  templateKey: "tools_ran",
  tplLang: "en",
  language: "en",
  needsNativeReview: false,
  ...over,
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const code = (i: VerifyInput) => {
  const r = verifyResponse(i);
  return r.ok ? "ok" : r.code;
};

const searchCall: Call = { name: "search_products", arguments: { category: "mobile-phones", inStockOnly: false, limit: 5 } };
const detailsCall = (id: string): Call => ({ name: "get_product_details", arguments: { productId: id } });

describe("the verifier accepts every genuine answer", () => {
  const cases: [string, () => ReturnType<typeof run>][] = [
    ["search", () => run([searchCall])],
    ["details with specs", () => run([detailsCall(ZEN)])],
    ["details of a sale product", () => run([detailsCall(ORBIT)])],
    ["details of a product with variants", () => run([detailsCall(NOVA)])],
    ["comparison of 2", () => run([{ name: "compare_products", arguments: { productIds: [NOVA, ORBIT] } }])],
    ["comparison of 4 with missing specifications", () => run([{ name: "compare_products", arguments: { productIds: [ZEN, TABLET, WATCH, NOVA] } }])],
    ["stock", () => run([{ name: "check_stock", arguments: { productId: WATCH, quantity: 2 } }])],
    ["accessories", () => run([{ name: "get_accessories", arguments: { productId: ZEN } }])],
    ["cart", () => run([{ name: "get_cart", arguments: {} }], "guest", [{ productId: itemId(3), variantKey: "", quantity: 2 }])],
    ["customer orders", () => run([{ name: "get_order_status", arguments: {} }], "customer")],
    ["cart proposal", () => run([{ name: "add_to_cart", arguments: { productId: ORBIT, quantity: 2 } }])],
  ];
  it.each(cases)("%s", async (_n, make) => {
    const r = await make();
    expect(r.cards.length + r.actions.length).toBeGreaterThan(0);
    expect(code(base(r))).toBe("ok");
  });
});

describe("product facts: every shown fact must equal the source", () => {
  const mutate = async (call: Call, fn: (c: Extract<Card, { type: "product" }>) => void, expected: VerifyFailure) => {
    const r = await run([call]);
    const cards = clone(r.cards);
    fn(cards.find((c) => c.type === "product") as Extract<Card, { type: "product" }>);
    expect(code(base(r, { cards }))).toBe(expected);
  };
  it("rejects a wrong price (text), a wrong amount, a different name, a different brand", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.price.text = "Rs. 1,000.00"), "product_mismatch");
    await mutate(detailsCall(NOVA), (c) => (c.price.amount = 1000), "product_mismatch");
    await mutate(detailsCall(NOVA), (c) => (c.name = "Nova X1 Ultra"), "product_mismatch");
    await mutate(detailsCall(NOVA), (c) => (c.brand = "Apple"), "product_mismatch");
  });
  it("rejects an invented list price, a missing list price on a sale item, and an invented offer", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.listPrice = { amount: 200000, text: "Rs. 200,000.00" }), "product_mismatch");
    await mutate(detailsCall(ORBIT), (c) => delete c.listPrice, "product_mismatch");
    await mutate(detailsCall(NOVA), (c) => (c.offerName = "90% off"), "product_mismatch");
  });
  it("rejects a flipped availability (fabricated stock status)", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.available = !c.available), "product_mismatch");
  });
  it("rejects an id that no tool returned (including a plausible one) and a card for a product the tools did not return", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.id = itemId(99)), "unknown_product");
    await mutate(detailsCall(NOVA), (c) => (c.id = itemId(2)), "unknown_product");
  });
  it("rejects an invented or altered specification and an invented warranty", async () => {
    await mutate(detailsCall(WATCH), (c) => (c.specs = [...(c.specs ?? []), { name: "Warranty", value: "10 years" }]), "product_mismatch");
    await mutate(detailsCall(ZEN), (c) => (c.specs = c.specs!.map((s) => (s.name === "Memory" ? { ...s, value: "64 GB" } : s))), "product_mismatch");
    await mutate(detailsCall(ZEN), (c) => (c.specs = [...c.specs!, { name: "Battery", value: "20 hours" }]), "product_mismatch");
  });
  it("rejects altered variants (label, price, availability) and an invented variant", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.variants![0]!.price = { amount: 1, text: "Rs. 1.00" }), "variant_mismatch");
    await mutate(detailsCall(NOVA), (c) => (c.variants![2]!.available = true), "variant_mismatch");
    await mutate(detailsCall(NOVA), (c) => c.variants!.push({ key: "999GB::Gold", label: "999GB Gold", available: true, price: { amount: 1, text: "Rs. 1.00" } }), "variant_mismatch");
  });
  it("rejects links that are not the product's own page, and an image that is not the source's", async () => {
    await mutate(detailsCall(NOVA), (c) => (c.url = "/products/some-other-product"), "link_not_approved");
    await mutate(detailsCall(NOVA), (c) => (c.url = "/admin"), "link_not_approved");
    await mutate(detailsCall(NOVA), (c) => (c.imageUrl = "https://evil.example/x.png"), "product_mismatch");
  });
});

describe("comparison facts", () => {
  const cmpCall: Call = { name: "compare_products", arguments: { productIds: [ZEN, TABLET, WATCH] } };
  const mutateCmp = async (fn: (c: Extract<Card, { type: "comparison" }>) => void, expected: VerifyFailure) => {
    const r = await run([cmpCall]);
    const cards = clone(r.cards);
    fn(cards[0] as Extract<Card, { type: "comparison" }>);
    expect(code(base(r, { cards }))).toBe(expected);
  };
  it("rejects an altered price row, an invented specification value for a product without it, and a wrong price difference", async () => {
    await mutateCmp((c) => (c.rows.find((r) => r.label === "Price")!.values[0] = "Rs. 1.00"), "comparison_mismatch");
    await mutateCmp((c) => (c.rows.find((r) => r.label === "Memory")!.values[1] = "8 GB"), "comparison_mismatch");
    await mutateCmp((c) => (c.priceDelta = { amount: 5, text: "Rs. 5.00" }), "comparison_mismatch");
    await mutateCmp((c) => delete c.priceDelta, "comparison_mismatch");
  });
  it("rejects a row with the wrong number of values and a product that was not compared", async () => {
    await mutateCmp((c) => c.rows[0]!.values.pop(), "comparison_mismatch");
    await mutateCmp((c) => (c.products[2] = { ...c.products[2]!, id: itemId(1), slug: "nova-x1", name: "Nova X1 Smartphone" }), "unknown_product");
  });
  it("accepts a missing specification shown as null (unavailable)", async () => {
    const r = await run([cmpCall]);
    expect((r.cards[0] as Extract<Card, { type: "comparison" }>).rows.find((x) => x.label === "Memory")!.values).toEqual(["16 GB", null, null]);
    expect(code(base(r))).toBe("ok");
  });
  it("rejects a comparison with no comparison result behind it", async () => {
    const r = await run([detailsCall(ZEN), detailsCall(TABLET)]);
    const fake = await run([{ name: "compare_products", arguments: { productIds: [ZEN, TABLET] } }]);
    expect(code(base(r, { cards: fake.cards }))).toBe("card_without_source");
  });
});

describe("stock, accessory, cart and order facts", () => {
  it("rejects a stock card that contradicts the source or has none", async () => {
    const r = await run([{ name: "check_stock", arguments: { productId: WATCH, quantity: 2 } }]);
    for (const fn of [(c: Extract<Card, { type: "stock" }>) => (c.available = !c.available), (c: Extract<Card, { type: "stock" }>) => (c.canFulfil = !c.canFulfil), (c: Extract<Card, { type: "stock" }>) => (c.productId = ZEN)]) {
      const cards = clone(r.cards);
      fn(cards[0] as Extract<Card, { type: "stock" }>);
      expect(["stock_mismatch", "card_without_source"]).toContain(code(base(r, { cards })));
    }
  });

  it("rejects an accessory that no explicit link supports, a wrong kind and a wrong 'for' product", async () => {
    const r = await run([{ name: "get_accessories", arguments: { productId: ZEN } }]);
    const other = await run([detailsCall(WATCH)]);
    const first = r.cards[0] as Extract<Card, { type: "accessory" }>;
    expect(code(base(r, { cards: [{ ...first, product: other.cards[0] as Extract<Card, { type: "product" }> }] }))).toBe("accessory_unauthorized");
    expect(code(base(r, { cards: [{ ...first, kind: "BACK_COVER" }] }))).toBe("accessory_unauthorized");
    expect(code(base(r, { cards: [{ ...first, forProductId: WATCH }] }))).toBe("accessory_unauthorized");
  });

  it("rejects a cart card with a different subtotal, an invented delivery charge or an altered line", async () => {
    const r = await run([{ name: "get_cart", arguments: {} }], "guest", [{ productId: itemId(3), variantKey: "", quantity: 2 }]);
    const edits: ((c: Extract<Card, { type: "cart" }>) => void)[] = [(c) => (c.subtotal = { amount: 1, text: "Rs. 1.00" }), (c) => (c.deliveryCharge = { amount: 0, text: "Rs. 0.00" }), (c) => (c.lines[0]!.quantity = 9), (c) => (c.lines[0]!.name = "Free phone")];
    for (const fn of edits) {
      const cards = clone(r.cards);
      fn(cards[0] as Extract<Card, { type: "cart" }>);
      expect(code(base(r, { cards })), String(fn)).toBe("cart_mismatch");
    }
  });

  it("rejects order details for a guest even if a tool somehow returned them, and any altered order field", async () => {
    const r = await run([{ name: "get_order_status", arguments: {} }], "customer");
    expect(code(base(r, { actor: "guest" }))).toBe("order_unauthorized");
    for (const fn of [(c: Extract<Card, { type: "order" }>) => (c.status = "DELIVERED"), (c: Extract<Card, { type: "order" }>) => (c.total = { amount: 1, text: "Rs. 1.00" }), (c: Extract<Card, { type: "order" }>) => (c.cancellable = !c.cancellable), (c: Extract<Card, { type: "order" }>) => (c.trackingNumber = "TRK-9999")]) {
      const cards = clone(r.cards);
      fn(cards[0] as Extract<Card, { type: "order" }>);
      expect(code(base(r, { cards })), String(fn)).toBe("order_mismatch");
    }
    const foreign = clone(r.cards);
    (foreign[0] as Extract<Card, { type: "order" }>).ref = MOCK_ORDER_REFS.cust2Placed;
    expect(code(base(r, { cards: foreign }))).toBe("card_without_source");
  });
});

describe("actions: proposals only, and approved links only", () => {
  it("rejects a cart action that does not ask, one with no tool proposal behind it, and one that was altered", async () => {
    const r = await run([{ name: "add_to_cart", arguments: { productId: ORBIT, quantity: 2 } }]);
    const a = r.actions[0] as Extract<ClientAction, { type: "cart.add" }>;
    expect(code(base(r, { actions: [{ ...a, confirm: "none" }] }))).toBe("action_unauthorized");
    expect(code(base(r, { actions: [{ ...a, quantity: 9 }] }))).toBe("action_unauthorized");
    expect(code(base(r, { actions: [{ ...a, productId: WATCH }] }))).toBe("action_unauthorized");
    expect(code(base(r, { actions: [{ type: "cart.remove", actionId: "act_00000001", productId: ORBIT, variantKey: "", confirm: "ask" }] }))).toBe("action_unauthorized");
    const none = await run([searchCall]);
    expect(code(base(none, { actions: [{ ...a }] }))).toBe("action_unauthorized");
  });

  it("allows only the approved hand-off pages and product pages the tools returned", async () => {
    const r = await run([detailsCall(NOVA)]);
    const nav = (href: string): ClientAction => ({ type: "navigate", actionId: "act_00000002", href });
    for (const ok of ["/checkout", "/cart", "/track-order", (r.cards[0] as Extract<Card, { type: "product" }>).url]) expect(code(base(r, { actions: [nav(ok)] })), ok).toBe("ok");
    for (const bad of ["/products/not-returned-by-any-tool", "/admin", "/api/internal/sync-orders", "/track-order?ref=VLK-261012-ABCDEFGHJK"]) expect(code(base(r, { actions: [nav(bad)] })), bad).toBe("link_not_approved");
  });
});

describe("reply text: fixed templates only, no unsupported claims", () => {
  it("rejects a model-sourced reply, an altered template, and a polished text that carries a fact or a link", async () => {
    const r = await run([searchCall]);
    expect(code(base(r, { reply: { text: "The Nova X1 is Rs. 129,900 and in stock.", source: "qwen" } }))).toBe("reply_unsupported");
    expect(code(base(r, { reply: { text: "Here is what I found. Only Rs. 1,000!", source: "template" } }))).toBe("reply_unsupported");
    const si = { language: "si" as const, tplLang: "si" as const, needsNativeReview: true };
    for (const text of ["මෙන්න Rs. 1,000 ක්", "මෙන්න 5 ක්", "මෙන්න https://evil.example", "no sinhala here", "මෙන්න 50%"]) {
      expect(code(base(r, { ...si, reply: { text, source: "sinhala-llm" } })), text).toBe("reply_unsupported");
    }
    expect(code(base(r, { ...si, reply: { text: "මෙන්න මට සොයාගත හැකි දේ.", source: "sinhala-llm" } }))).toBe("ok");
  });
});

describe("sensitive-data leakage in outgoing text", () => {
  const leak = async (edit: (c: Extract<Card, { type: "product" }>) => void) => {
    // The source itself carries the sensitive text (for example a careless catalogue entry), so only the leak scan can catch it.
    const r = await run([detailsCall(NOVA)]);
    const outcomes = clone(r.outcomes) as ToolOutcome[];
    const data = (outcomes[0] as { data: { product: { name: string; specs: { name: string; value: string }[] } } }).data;
    const card = clone(r.cards[0]) as Extract<Card, { type: "product" }>;
    edit(card);
    data.product.name = card.name;
    data.product.specs = card.specs ?? data.product.specs;
    return code(base({ ...r, outcomes }, { cards: [card] }));
  };
  it.each([
    ["a card number in a name", (c: Extract<Card, { type: "product" }>) => (c.name = "Nova 4111 1111 1111 1111")],
    ["an API key in a spec", (c: Extract<Card, { type: "product" }>) => (c.specs = [{ name: "Note", value: "api_key: sk_live_abcdefghijklmnop" }])],
    ["a bearer token in a spec", (c: Extract<Card, { type: "product" }>) => (c.specs = [{ name: "Note", value: "Bearer abcdefghijklmnopqrstuvwxyz0123" }])],
    ["a password in a spec", (c: Extract<Card, { type: "product" }>) => (c.specs = [{ name: "Note", value: "my password is hunter22" }])],
  ])("rejects %s even though it matches the source", async (_n, edit) => {
    expect(await leak(edit)).toBe("sensitive_leak");
  });
  it("rejects a secret in a suggestion", async () => {
    const r = await run([searchCall]);
    expect(code(base(r, { suggestions: ["use hxs_abc123.secret456"] }))).toBe("sensitive_leak");
  });
});

describe("Sinhala and mixed output needs native review", () => {
  it("fails when the review flag is missing for Sinhala, Singlish or Sinhala text anywhere in the answer", async () => {
    const r = await run([searchCall]);
    const si = renderTemplate("tools_ran", "si").text;
    expect(code(base(r, { language: "si", tplLang: "si", reply: { text: si, source: "template" }, needsNativeReview: false }))).toBe("review_flag_missing");
    expect(code(base(r, { language: "mixed", tplLang: "si", reply: { text: si, source: "template" }, needsNativeReview: false }))).toBe("review_flag_missing");
    expect(code(base(r, { language: "si", tplLang: "si", reply: { text: si, source: "template" }, needsNativeReview: true }))).toBe("ok");
    const withSinhalaCard = clone(r.cards);
    expect(code(base(r, { cards: withSinhalaCard, suggestions: ["ඉතා හොඳයි"], needsNativeReview: false }))).toBe("review_flag_missing");
  });
});

describe("contract version compatibility", () => {
  it("refuses a 4-product comparison for a 1.0 client, accepts it for 1.1, and always accepts 2 and 3", async () => {
    const four = await run([{ name: "compare_products", arguments: { productIds: [ZEN, TABLET, WATCH, NOVA] } }]);
    const three = await run([{ name: "compare_products", arguments: { productIds: [ZEN, TABLET, WATCH] } }]);
    expect(verifyVersionShape(four.cards, "1")).toEqual({ ok: false, code: "contract_version" });
    expect(verifyVersionShape(four.cards, "1.1")).toEqual({ ok: true });
    expect(verifyVersionShape(three.cards, "1")).toEqual({ ok: true });
  });
});

describe("missing information", () => {
  it("accepts an answer with no cards for an empty search, and never a card for a product the search did not find", async () => {
    const r = await run([{ name: "search_products", arguments: { category: "tablets", maxPriceLkr: 1000, inStockOnly: true, limit: 5 } }]);
    expect(r.cards).toEqual([]);
    expect(code(base(r, { reply: { text: renderTemplate("no_results", "en").text, source: "template" }, templateKey: "no_results" }))).toBe("ok");
    const found = await run([detailsCall(NOVA)]);
    expect(code(base(r, { cards: found.cards }))).toBe("unknown_product");
  });
});
