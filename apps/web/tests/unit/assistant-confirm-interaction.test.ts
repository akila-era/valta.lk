import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CartAction } from "@/components/assistant/types";

/**
 * Handler-level interaction tests for the Confirm and Cancel buttons. The web workspace has no DOM library, so React's useState is
 * replaced by a recorder and the rendered element tree is walked to find the buttons and call their onClick, exactly as a click would.
 * A real-browser version of the same behaviour is in tests/e2e/assistant-demo.spec.ts.
 */
const hook = vi.hoisted(() => ({ value: "pending" as string, sets: [] as string[] }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => [hook.value ?? initial, (v: string) => hook.sets.push(v)] };
});

import { CartProposalConfirm } from "@/components/assistant/cards";

function buttons(node: ReactNode, out: ReactElement<{ onClick?: () => void; children?: ReactNode }>[] = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => buttons(n, out));
    return out;
  }
  const el = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
  if (el.type === "button") out.push(el);
  buttons(el.props?.children, out);
  return out;
}
const text = (el: ReactElement<{ children?: ReactNode }>) => String(el.props.children);

const action: CartAction = { type: "cart.add", actionId: "act_00000001", productId: "demo-nova-x1", variantKey: "", quantity: 2, confirm: "ask" };
function render(onConfirm = vi.fn(), onCancel = vi.fn()) {
  hook.sets.length = 0;
  hook.value = "pending";
  const tree = CartProposalConfirm({ action, productName: "Nova X1 Smartphone", onConfirm, onCancel });
  return { tree, onConfirm, onCancel };
}

describe("cart confirmation buttons", () => {
  it("offers exactly Confirm and Cancel and has called nothing before a click", () => {
    const { tree, onConfirm, onCancel } = render();
    expect(buttons(tree).map(text)).toEqual(["Confirm", "Cancel"]);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Confirm calls onConfirm once with the proposal and never onCancel", () => {
    const { tree, onConfirm, onCancel } = render();
    buttons(tree).find((b) => text(b) === "Confirm")!.props.onClick!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(action);
    expect(onCancel).not.toHaveBeenCalled();
    expect(hook.sets).toEqual(["done"]);
  });

  it("Cancel calls onCancel once and never onConfirm", () => {
    const { tree, onConfirm, onCancel } = render();
    buttons(tree).find((b) => text(b) === "Cancel")!.props.onClick!();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(action);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(hook.sets).toEqual(["dismissed"]);
  });

  it("after a decision the buttons are gone, so the same proposal cannot be confirmed twice", () => {
    for (const settled of ["done", "dismissed"]) {
      hook.value = settled;
      const tree = CartProposalConfirm({ action, productName: "Nova X1 Smartphone", onConfirm: vi.fn(), onCancel: vi.fn() });
      expect(buttons(tree)).toEqual([]);
    }
  });
});
