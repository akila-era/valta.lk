/**
 * The approval framework's vocabulary. Every tool, present and future, belongs to exactly one class, and the class decides what must
 * happen before its effect is allowed. This file is a CONTRACT: M3-A defines it and tests that every existing tool is classified;
 * the pipeline will enforce it in a later phase (nothing here changes live behaviour).
 *
 *  - read:       reads data within the caller's permissions. No confirmation.
 *  - reversible: changes something the shopper can undo (a cart line). Runs only after the shopper's own confirmation in their
 *                browser, and the result must offer an undo.
 *  - sensitive:  changes account data or sends information to the store (profile, address, a contact form). Needs an explicit
 *                confirmation card that shows exactly what will be sent.
 *  - financial:  payment, placing an order, a discount. The assistant NEVER performs these. No tool may have this class: the shopper
 *                is handed to the existing checkout. The class exists so a test can prove none is registered.
 */
export const ACTION_CLASSES = ["read", "reversible", "sensitive", "financial"] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

/** How the confirmation for a class is obtained. "never" means the action is not available to the assistant at all. */
export const CONFIRMATION_RULE: Record<ActionClass, "none" | "shopper-click" | "confirmation-card" | "never"> = {
  read: "none",
  reversible: "shopper-click",
  sensitive: "confirmation-card",
  financial: "never",
};

/** Existing live tools. Cart tools only ever PROPOSE; the browser performs the change after the shopper confirms. */
export const TOOL_ACTION_CLASS: Readonly<Record<string, ActionClass>> = Object.freeze({
  search_products: "read",
  get_product_details: "read",
  compare_products: "read",
  check_stock: "read",
  get_accessories: "read",
  get_cart: "read",
  get_order_status: "read",
  add_to_cart: "reversible",
  update_cart_quantity: "reversible",
  remove_from_cart: "reversible",
});

export function actionClassOf(toolName: string): ActionClass | null {
  return Object.hasOwn(TOOL_ACTION_CLASS, toolName) ? TOOL_ACTION_CLASS[toolName]! : null;
}

/** A single-use confirmation, bound to one session and the exact action, so it cannot be replayed or reused for another action. */
export interface ConfirmationToken {
  tokenId: string;
  sessionId: string;
  actionClass: Exclude<ActionClass, "read" | "financial">;
  /** Hash of the canonical action (type and arguments). A different action produces a different hash. */
  actionHash: string;
  expiresAt: number;
}
