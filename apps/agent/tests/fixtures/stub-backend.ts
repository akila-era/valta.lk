import type { ToolBackend } from "../../src/tools/definitions";
import { ToolError } from "../../src/tools/registry";
import { itemId, MOCK_VOCAB } from "./mock-vocab";

/** A stand-in backend: records every call and returns small canned data. M1-C replaces it with mock-ERP-backed tools. */
export function createStubBackend() {
  const calls: { tool: string; args: unknown; actor: string }[] = [];
  const rec = (tool: string, args: unknown, ctx: { actor: { kind: string; customerId?: string } }) => calls.push({ tool, args, actor: ctx.actor.kind + (ctx.actor.customerId ? `:${ctx.actor.customerId}` : "") });
  const exists = (id: string) => MOCK_VOCAB.products.some((p) => p.id === id);

  const backend: ToolBackend = {
    async search_products(args, ctx) {
      rec("search_products", args, ctx);
      return { total: 2, items: [itemId(1), itemId(2)] };
    },
    async get_product_details(args, ctx) {
      rec("get_product_details", args, ctx);
      if (!exists(args.productId)) throw new ToolError("NOT_FOUND", "Product not found.");
      return { id: args.productId };
    },
    async compare_products(args, ctx) {
      rec("compare_products", args, ctx);
      return { ids: args.productIds };
    },
    async check_stock(args, ctx) {
      rec("check_stock", args, ctx);
      return { productId: args.productId, available: true };
    },
    async get_accessories(args, ctx) {
      rec("get_accessories", args, ctx);
      return { items: [] };
    },
    async get_cart(args, ctx) {
      rec("get_cart", args, ctx);
      return { lines: [] };
    },
    async add_to_cart(args, ctx) {
      rec("add_to_cart", args, ctx);
      return { kind: "proposal", clientAction: { type: "cart.add", actionId: "act_stub_00000001", productId: args.productId, variantKey: args.variantKey, quantity: args.quantity, confirm: "ask" } };
    },
    async update_cart_quantity(args, ctx) {
      rec("update_cart_quantity", args, ctx);
      return { kind: "proposal", clientAction: { type: "cart.setQuantity", actionId: "act_stub_00000002", productId: args.productId, variantKey: args.variantKey, quantity: args.quantity, confirm: "ask" } };
    },
    async remove_from_cart(args, ctx) {
      rec("remove_from_cart", args, ctx);
      return { kind: "proposal", clientAction: { type: "cart.remove", actionId: "act_stub_00000003", productId: args.productId, variantKey: args.variantKey, confirm: "ask" } };
    },
    async get_order_status(args, ctx) {
      rec("get_order_status", args, ctx);
      return { orders: [] };
    },
  };
  return { backend, calls };
}
