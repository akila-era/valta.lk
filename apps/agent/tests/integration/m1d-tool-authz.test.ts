import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockToolBackend } from "../../src/backend/mock-backend";
import { FixtureErpTransport, itemId, MOCK_ORDER_REFS } from "../../src/mock/erp-fixture";
import { createMockStack } from "../../src/mock/stack";
import { runToolCalls } from "../../src/tools/runner";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";
import { customerCtx, guestCtx, run } from "../fixtures/pipeline-helpers";
import { mockStack, toolCall } from "../fixtures/mock-stack-helpers";

const NOVA = itemId(1);
let fake: FakeOllama;
beforeEach(async () => {
  fake = await startFakeOllama();
});
afterEach(async () => {
  await fake.close();
});

describe("the tool allow-list is closed and has no way to buy, pay, create orders or change data", () => {
  it("exposes exactly ten tools, each read-only or a browser-side proposal", () => {
    const { registry } = createMockStack();
    expect(registry.list().map((t) => t.name).sort()).toEqual(["add_to_cart", "check_stock", "compare_products", "get_accessories", "get_cart", "get_order_status", "get_product_details", "remove_from_cart", "search_products", "update_cart_quantity"]);
    expect(new Set(registry.list().map((t) => t.effect))).toEqual(new Set(["read", "proposal"]));
    expect(registry.list().map((t) => t.name).join(" ")).not.toMatch(/checkout|pay|place|create|order_create|discount|coupon|price_set|refund|cancel|delete|update_stock|admin/);
  });

  it("the backend class and the ERP transport have no write method at all", () => {
    const backendMethods = Object.getOwnPropertyNames(MockToolBackend.prototype).filter((m) => m !== "constructor");
    expect(backendMethods.join(" ")).not.toMatch(/create|place|pay|checkout|discount|refund|cancel|delete|submit|post/i);
    const transportMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(new FixtureErpTransport())).filter((m) => m !== "constructor" && m !== "check" && !/^set|^remove/.test(m));
    expect(transportMethods.sort()).toEqual(["getOrder", "getProduct", "getSettings", "listProducts"]);
  });

  it("every tool schema is strict: an unknown field is rejected, never dropped", async () => {
    const s = createMockStack();
    for (const t of s.registry.list()) {
      const r = t.args.safeParse({ __extra__: 1 });
      expect(r.success, t.name).toBe(false);
    }
  });
});

describe("names a model might invent are never executed", () => {
  const forbidden = ["place_order", "create_order", "checkout", "pay", "make_payment", "apply_discount", "apply_coupon", "set_price", "update_stock", "get_all_orders", "admin_list_customers", "delete_order", "cancel_order", "refund_order", "Add_To_Cart", "add_to_cart ", " add_to_cart", "add_to_cart\n", "../add_to_cart", "constructor", "__proto__", "toString", "hasOwnProperty", "", "a".repeat(500)];
  it("rejects each as an unknown tool without touching the backend", async () => {
    const s = createMockStack();
    const outcomes = await runToolCalls(s.registry, forbidden.slice(0, 3).map((name) => ({ name, arguments: {} })), customerCtx("cust_1"));
    expect(outcomes.every((o) => o.status === "unknown_tool")).toBe(true);
    for (const name of forbidden) {
      const [o] = await runToolCalls(s.registry, [{ name, arguments: { productId: NOVA, quantity: 1 } }], customerCtx("cust_1"));
      expect(o?.status, JSON.stringify(name).slice(0, 30)).toBe("unknown_tool");
    }
    expect(s.transport.calls).toEqual({ list: 0, product: 0, settings: 0, order: 0 });
  });

  it("ignores non-string tool names", async () => {
    const s = createMockStack();
    for (const name of [null, undefined, 42, {}, [], ["add_to_cart"]]) {
      const [o] = await runToolCalls(s.registry, [{ name: name as never, arguments: {} }], customerCtx("cust_1"));
      expect(o?.status).toBe("unknown_tool");
    }
  });

  it("through the pipeline, a model asking for forbidden tools produces no action, no card and no ERP call", async () => {
    fake.setResponder(() => ({ content: "", tool_calls: forbidden.slice(0, 8).map((n) => toolCall(n, { productId: NOVA })) }));
    const s = mockStack(fake, { qwen: true });
    const { result } = await run(s.pipeline, "buy the nova x1 right now with my saved card", { customer: true });
    expect(result.actions).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(s.transport.calls.order).toBe(0);
  });
});

describe("permission checks run before execution", () => {
  it("a guest cannot run get_order_status even with a perfectly valid call, and nothing is read", async () => {
    const s = createMockStack();
    const [o] = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: { ref: MOCK_ORDER_REFS.cust1Placed } }], guestCtx());
    expect(o?.status).toBe("forbidden");
    expect(s.transport.calls.order).toBe(0);
  });

  it("the actor comes from the server context, and no argument can name or change it", async () => {
    const s = createMockStack();
    for (const args of [{ customerId: "cust_1" }, { actor: "customer" }, { identity: "cust:cust_1" }, { ref: MOCK_ORDER_REFS.cust1Placed, customerId: "cust_1" }]) {
      const [o] = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: args }], guestCtx());
      expect(o?.status).toBe("forbidden");
      const [o2] = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: args }], customerCtx("cust_2"));
      expect(["invalid_args", "ok", "error"]).toContain(o2?.status);
      if (o2?.status === "ok") expect(JSON.stringify(o2.data)).not.toContain(MOCK_ORDER_REFS.cust1Placed);
    }
  });

  it("a customer can read only their own orders, and a reference that is another customer's is not found", async () => {
    const s = createMockStack();
    const own = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: { ref: MOCK_ORDER_REFS.cust1Placed } }], customerCtx("cust_1"));
    expect(own[0]?.status).toBe("ok");
    const foreign = await runToolCalls(s.registry, [{ name: "get_order_status", arguments: { ref: MOCK_ORDER_REFS.cust2Placed } }], customerCtx("cust_1"));
    expect(foreign[0]).toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    expect(JSON.stringify(foreign)).not.toContain("Atlas");
  });
});

describe("validation limits per turn", () => {
  it("runs at most three calls in one turn and refuses an exact repeat", async () => {
    const s = createMockStack();
    const calls = [
      { name: "search_products", arguments: { query: "nova" } },
      { name: "search_products", arguments: { query: "nova" } },
      { name: "get_product_details", arguments: { productId: NOVA } },
      { name: "check_stock", arguments: { productId: NOVA } },
      { name: "get_cart", arguments: {} },
    ];
    const out = await runToolCalls(s.registry, calls, guestCtx());
    expect(out.map((o) => o.status)).toEqual(["ok", "duplicate", "ok", "too_many", "too_many"]);
  });
});

describe("cart changes are proposals that always ask, and never touch a server cart", () => {
  it("add, update and remove return only a proposal, and the ERP is only read", async () => {
    const s = createMockStack();
    const cart = [{ productId: itemId(8), variantKey: "", quantity: 1 }];
    const out = await runToolCalls(
      s.registry,
      [
        { name: "add_to_cart", arguments: { productId: itemId(2), quantity: 1 } },
        { name: "update_cart_quantity", arguments: { productId: itemId(8), quantity: 3 } },
        { name: "remove_from_cart", arguments: { productId: itemId(8) } },
      ],
      guestCtx(cart),
    );
    for (const o of out) {
      expect(o.status).toBe("ok");
      expect((o as { data: { kind: string; clientAction: { confirm: string } } }).data).toMatchObject({ kind: "proposal", clientAction: { confirm: "ask" } });
    }
    expect(Object.keys(s.transport.calls).sort()).toEqual(["list", "order", "product", "settings"]); // reads only: the transport has no write counter
  });

  it("refuses quantities that are negative, zero, fractional, over the limit or not numbers, and unavailable items", async () => {
    const s = createMockStack();
    for (const quantity of [-1, 0, 1.5, 11, 9999, "2", null, NaN]) {
      const [o] = await runToolCalls(s.registry, [{ name: "add_to_cart", arguments: { productId: NOVA, variantKey: "128GB::Black", quantity } }], guestCtx());
      expect(o?.status, String(quantity)).toBe("invalid_args");
    }
    const [soldOut] = await runToolCalls(s.registry, [{ name: "add_to_cart", arguments: { productId: itemId(13), quantity: 1 } }], guestCtx());
    expect(soldOut).toMatchObject({ status: "error" });
  });

  it("an adversarial cart snapshot cannot create a proposal for a product that is not in it, or exceed the limit", async () => {
    const s = createMockStack();
    const [absent] = await runToolCalls(s.registry, [{ name: "remove_from_cart", arguments: { productId: itemId(8) } }], guestCtx([{ productId: itemId(3), variantKey: "", quantity: 1 }]));
    expect(absent).toMatchObject({ status: "error", error: { code: "NOT_IN_CART" } });
    const [over] = await runToolCalls(s.registry, [{ name: "add_to_cart", arguments: { productId: itemId(3), quantity: 10 } }], guestCtx([{ productId: itemId(3), variantKey: "", quantity: 5 }]));
    expect(over).toMatchObject({ status: "error" });
  });

  it("no path through the pipeline produces checkout, payment, order creation or discount: the only actions are cart proposals and three hand-off pages", async () => {
    const s = mockStack(fake, { qwen: false });
    const seen = new Set<string>();
    for (const m of ["I want to place an order", "check out now", "pay for my cart", "cancel my order", "buy it", "Orbit Pro එක cart එකට දාන්න", "where is my order", "Show me phones", "remove the Atlas Smartwatch from my cart", "proceed to payment"]) {
      for (const customer of [false, true]) {
        const { result } = await run(s.pipeline, m, { customer, cart: [{ productId: itemId(8), quantity: 1 }] });
        for (const a of result.actions) {
          seen.add(a.type === "navigate" ? `navigate:${a.href}` : a.type);
          if (a.type !== "navigate") expect(a.confirm).toBe("ask");
        }
      }
    }
    for (const kind of seen) expect(["cart.add", "cart.setQuantity", "cart.remove", "navigate:/checkout", "navigate:/track-order", "navigate:/cart"]).toContain(kind);
    expect(seen.size).toBeGreaterThan(2);
  });
});
