import { z } from "zod";
import { MAX_COMPARE_PRODUCTS, ORDER_REF } from "../contract/schemas";
import type { OllamaToolSchema } from "../ollama/models";
import { defineTool, type ActorKind, type ToolContext, type ToolDef, ToolRegistry } from "./registry";

/**
 * The ten shopping tools, with strict argument schemas and a permission for each actor kind. This file defines WHAT may be
 * asked; the backend (a mock in M1-B, mock-ERP-backed in M1-C) decides what the answer is. A tool can only read, or propose a
 * browser-side cart action: there is no tool that creates an order, takes a payment, applies a discount or changes a price.
 */
const ProductId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "product id");
const VariantKey = z.string().max(200);
const noControl = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const SearchText = z.string().trim().max(100).regex(noControl);
const Qty = z.number().int().min(1).max(10);
const Lkr = z.number().int().min(0).max(100_000_000);

/** The functions a backend must provide. Each returns plain data; cards are built from it elsewhere. */
export interface ToolBackend {
  search_products(args: SearchProductsArgs, ctx: ToolContext): Promise<unknown>;
  get_product_details(args: { productId: string }, ctx: ToolContext): Promise<unknown>;
  compare_products(args: { productIds: string[] }, ctx: ToolContext): Promise<unknown>;
  check_stock(args: { productId: string; variantKey?: string | undefined; quantity?: number | undefined }, ctx: ToolContext): Promise<unknown>;
  get_accessories(args: { productId: string; variantKey?: string | undefined }, ctx: ToolContext): Promise<unknown>;
  get_cart(args: Record<string, never>, ctx: ToolContext): Promise<unknown>;
  add_to_cart(args: { productId: string; variantKey: string; quantity: number }, ctx: ToolContext): Promise<unknown>;
  update_cart_quantity(args: { productId: string; variantKey: string; quantity: number }, ctx: ToolContext): Promise<unknown>;
  remove_from_cart(args: { productId: string; variantKey: string }, ctx: ToolContext): Promise<unknown>;
  get_order_status(args: { ref?: string | undefined }, ctx: ToolContext): Promise<unknown>;
}

export interface SearchProductsArgs {
  query?: string | undefined;
  category?: string | undefined;
  brand?: string | undefined;
  minPriceLkr?: number | undefined;
  maxPriceLkr?: number | undefined;
  inStockOnly: boolean;
  onSale?: boolean | undefined;
  sort?: "newest" | "price-asc" | "price-desc" | "name" | undefined;
  limit: number;
}

const BOTH: ActorKind[] = ["guest", "customer"];

export function createToolRegistry(b: ToolBackend): ToolRegistry {
  const r = new ToolRegistry();

  r.register(
    defineTool({
      name: "search_products",
      description: "Search the catalogue. Use for finding products by name, brand, category, budget or sale.",
      shape: {
        query: SearchText.optional().describe("Product or brand words in English letters"),
        category: z.string().trim().max(100).regex(/^[a-z0-9-]+$/).optional().describe("Category slug"),
        brand: z.string().trim().max(80).regex(noControl).optional(),
        minPriceLkr: Lkr.optional(),
        maxPriceLkr: Lkr.optional(),
        inStockOnly: z.boolean().default(true),
        onSale: z.boolean().optional(),
        sort: z.enum(["newest", "price-asc", "price-desc", "name"]).optional(),
        limit: z.number().int().min(1).max(8).default(5),
      },
      allow: BOTH,
      effect: "read",
      check: (a) => (a.minPriceLkr !== undefined && a.maxPriceLkr !== undefined && a.minPriceLkr > a.maxPriceLkr ? "minPriceLkr is above maxPriceLkr" : null),
      execute: (a, ctx) => b.search_products(a as SearchProductsArgs, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "get_product_details",
      description: "Get the details of one product by its id.",
      shape: { productId: ProductId },
      allow: BOTH,
      effect: "read",
      execute: (a, ctx) => b.get_product_details(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "compare_products",
      description: "Compare two or three products by id.",
      shape: { productIds: z.array(ProductId).min(2).max(MAX_COMPARE_PRODUCTS) },
      allow: BOTH,
      effect: "read",
      check: (a) => (new Set(a.productIds).size !== a.productIds.length ? "productIds must be different products" : null),
      execute: (a, ctx) => b.compare_products(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "check_stock",
      description: "Check whether a product (and optionally a variant and quantity) is in stock.",
      shape: { productId: ProductId, variantKey: VariantKey.optional(), quantity: Qty.optional() },
      allow: BOTH,
      effect: "read",
      execute: (a, ctx) => b.check_stock(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "get_accessories",
      description: "List accessories that staff linked as compatible with a product.",
      shape: { productId: ProductId, variantKey: VariantKey.optional() },
      allow: BOTH,
      effect: "read",
      execute: (a, ctx) => b.get_accessories(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "get_cart",
      description: "Show the shopper's current cart with live prices.",
      shape: {},
      allow: BOTH,
      effect: "read",
      execute: (a, ctx) => b.get_cart(a as Record<string, never>, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "add_to_cart",
      description: "Propose adding a product to the cart. The shopper's browser applies it.",
      shape: { productId: ProductId, variantKey: VariantKey.default(""), quantity: Qty.default(1) },
      allow: BOTH,
      effect: "proposal",
      execute: (a, ctx) => b.add_to_cart(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "update_cart_quantity",
      description: "Propose changing the quantity of a cart line.",
      shape: { productId: ProductId, variantKey: VariantKey.default(""), quantity: Qty },
      allow: BOTH,
      effect: "proposal",
      execute: (a, ctx) => b.update_cart_quantity(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "remove_from_cart",
      description: "Propose removing a product from the cart.",
      shape: { productId: ProductId, variantKey: VariantKey.default("") },
      allow: BOTH,
      effect: "proposal",
      execute: (a, ctx) => b.remove_from_cart(a, ctx),
    }),
  );

  r.register(
    defineTool({
      name: "get_order_status",
      description: "Status of the signed-in customer's own orders.",
      shape: { ref: z.string().regex(ORDER_REF).optional() },
      allow: ["customer"],
      effect: "read",
      execute: (a, ctx) => b.get_order_status(a, ctx),
    }),
  );

  return r;
}

/** Tool names a model may be shown, for the given actor. */
export function toolsFor(registry: ToolRegistry, kind: ActorKind): ToolDef[] {
  return registry.list().filter((t) => t.allow.includes(kind));
}

/** Compact JSON-schema tool list for Qwen. Only tools this actor may use are shown, so a guest never sees get_order_status. */
export function toOllamaTools(registry: ToolRegistry, kind: ActorKind): OllamaToolSchema[] {
  return toolsFor(registry, kind).map((t) => {
    const schema = z.toJSONSchema(t.args, { io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    delete schema.additionalProperties;
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const p of Object.values(props)) delete p.default; // keeps the prompt short; defaults are applied server-side
    return { type: "function" as const, function: { name: t.name, description: t.description, parameters: schema } };
  });
}
