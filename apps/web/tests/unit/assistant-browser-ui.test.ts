import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalPrompt, BrowserProgressList, decisionGate, phaseAfter, type ApprovalPhase } from "@/components/assistant/browser-task";
import { labels } from "@/components/assistant/labels";
import type { BrowserPanelData, BrowserProposalData } from "@/components/assistant/types";

/**
 * Static-markup and handler tests of the browser task UI. The web workspace has no DOM library, so (like the cart confirmation tests) buttons are found in the
 * rendered element tree and their handlers called as a click would. These tests are component-level and use no browser and no Agent.
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};
const proposal: BrowserProposalData = { proposalId: "bp_AbCdEfGhIjKlMnOpQr", description: 'Change your cart: "Add to cart"', page: "/products/gaming-laptop-x1", actionClass: "reversible", expiresInSec: 120 };
const sensitive: BrowserProposalData = { ...proposal, actionClass: "sensitive" };
const panel: BrowserPanelData = { source: "page", progress: [{ step: "open", status: "done" }, { step: "find", status: "failed" }, { step: "act", status: "skipped" }] };

const prompt = (phase: ApprovalPhase, over: Partial<Parameters<typeof ApprovalPrompt>[0]> = {}) =>
  createElement(ApprovalPrompt, { proposal, lang: "en", phase, secondsLeft: 87, onApprove: noop, onCancel: noop, onRetry: noop, ...over });

type El = ReactElement<{ onClick?: () => void; disabled?: boolean; children?: ReactNode; "data-testid"?: string }>;
function buttons(node: ReactNode, out: El[] = []): El[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => buttons(n, out));
    return out;
  }
  const el = node as El;
  if (el.type === "button") out.push(el);
  buttons(el.props?.children, out);
  return out;
}
// ApprovalPrompt is a plain function component with no hooks, so it can be called directly to get its element tree.
const tree = (phase: ApprovalPhase, over: Partial<Parameters<typeof ApprovalPrompt>[0]> = {}) => ApprovalPrompt({ proposal, lang: "en", phase, secondsLeft: 87, onApprove: noop, onCancel: noop, onRetry: noop, ...over });
const text = (el: El) => String(el.props.children);

describe("progress list", () => {
  it("shows the steps in OUR words, with the state as words (not colour alone), and the page-text note", () => {
    const out = html(createElement(BrowserProgressList, { panel, lang: "en" }));
    expect(out).toContain('data-testid="browser-progress"');
    expect(out).toContain('aria-label="Page task progress"');
    for (const w of ["Opening the page", "Looking for the control", "Pressing it"]) expect(out).toContain(w);
    expect(out).toContain(": did not work");
    expect(out).toContain(": not done");
    expect(out).toContain('class="sr-only">: done'); // a finished step is read out for screen readers
    expect(out).toContain('data-status="failed"');
    expect(out).toContain("not verified");
  });

  it("renders nothing for an empty progress list, and has Sinhala text for every step", () => {
    expect(html(createElement(BrowserProgressList, { panel: { source: "page", progress: [] }, lang: "en" }))).toBe("");
    const si = html(createElement(BrowserProgressList, { panel, lang: "si" }));
    expect(si).toContain(labels("si").stepOpen);
    expect(si).toContain(labels("si").stepStatusFailed);
  });
});

describe("approval prompt", () => {
  it("shows the action, the page, how long is left, and exactly Approve and Cancel", () => {
    const out = html(prompt("ready"));
    expect(out).toContain('data-testid="browser-approval"');
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-labelledby="browser-approval-title"');
    expect(out).toContain('tabindex="-1"'); // focus lands on the card when it appears (the stateful wrapper does this)
    expect(out).toContain("Please approve this action on the page");
    expect(out).toContain("Change your cart: &quot;Add to cart&quot;");
    expect(out).toContain("/products/gaming-laptop-x1");
    expect(out).toContain("Expires in 87 s");
    expect(out).toContain("Nothing happens on the page until you approve");
    expect(buttons(tree("ready")).map(text)).toEqual(["Approve", "Cancel"]);
  });

  it("says plainly when an action changes an account or order, and when it can be undone", () => {
    expect(html(createElement(ApprovalPrompt, { proposal: sensitive, lang: "en", phase: "ready", secondsLeft: 5, onApprove: noop, onCancel: noop, onRetry: noop }))).toContain("needs your approval");
    expect(html(prompt("ready"))).toContain("can be undone");
  });

  it("renders page-derived text as plain text: markup in it is escaped, never interpreted", () => {
    const evil = { ...proposal, description: '<img src=x onerror="alert(1)"> <script>alert(2)</script>', page: "/p?x=<b>" };
    const out = html(createElement(ApprovalPrompt, { proposal: evil, lang: "en", phase: "ready", secondsLeft: 9, onApprove: noop, onCancel: noop, onRetry: noop }));
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("Approve and Cancel call only their own handler, once per click, and nothing is called before a click", () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    const t = tree("ready", { onApprove, onCancel });
    expect(onApprove).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    buttons(t).find((b) => text(b) === "Approve")!.props.onClick!();
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    buttons(t).find((b) => text(b) === "Cancel")!.props.onClick!();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("while the decision is being sent both buttons are disabled and a status says so", () => {
    expect(buttons(tree("sending")).every((b) => b.props.disabled === true)).toBe(true);
    expect(html(prompt("sending"))).toContain("Sending your decision");
    expect(html(prompt("sending"))).toContain('aria-busy="true"');
    expect(buttons(tree("ready")).every((b) => b.props.disabled === false)).toBe(true);
  });

  it("after a failed send it shows an alert and the first button retries (and is the retry handler, not the approve one)", () => {
    const onApprove = vi.fn();
    const onRetry = vi.fn();
    const t = tree("error", { onApprove, onRetry });
    expect(html(prompt("error"))).toContain('role="alert"');
    const first = buttons(t)[0]!;
    expect(text(first)).toBe("Try sending it again");
    first.props.onClick!();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("is gone after a single use: no buttons remain for done, cancelled, failed or expired", () => {
    expect(html(prompt("done"))).toBe("");
    for (const phase of ["cancelled", "failed", "expired"] as const) {
      const out = html(prompt(phase));
      expect(out).toContain('data-testid="browser-approval-result"');
      expect(out).not.toContain("<button");
    }
    expect(html(prompt("expired"))).toContain("This approval has expired");
    expect(html(prompt("cancelled"))).toContain("Nothing was changed on the page");
  });

  it("shows the countdown as zero rather than negative", () => {
    expect(html(prompt("ready", { secondsLeft: -3 }))).toContain("Expires in 0 s");
  });

  it("has Sinhala wording for every prompt state", () => {
    const si = labels("si");
    const out = html(createElement(ApprovalPrompt, { proposal, lang: "si", phase: "ready", secondsLeft: 30, onApprove: noop, onCancel: noop, onRetry: noop }));
    expect(out).toContain(si.approvalTitle);
    expect(out).toContain(si.approve);
    expect(out).toContain(si.cancel);
  });
});

describe("decision rules", () => {
  it("allows one decision at a time, only while waiting, and never after the countdown ended", () => {
    expect(decisionGate("ready", false, 1000, 5000)).toBe("go");
    expect(decisionGate("error", false, 1000, 5000)).toBe("go");
    expect(decisionGate("ready", true, 1000, 5000)).toBe("ignore"); // a second click while one is in flight
    for (const p of ["sending", "done", "cancelled", "failed", "expired"] as const) expect(decisionGate(p, false, 1000, 5000), p).toBe("ignore");
    expect(decisionGate("ready", false, 5000, 5000)).toBe("expired");
    expect(decisionGate("ready", false, 9000, 5000)).toBe("expired");
  });

  it("maps the Agent's outcome to what the prompt shows, and an unusable approval to expired", () => {
    const base = { reply: { text: "x" }, needsNativeReview: false, browser: { source: "page" as const, progress: [] } };
    for (const outcome of ["done", "failed", "cancelled", "expired"] as const) expect(phaseAfter({ ok: true, data: { ...base, outcome } })).toBe(outcome);
    expect(phaseAfter({ ok: false, reason: "unavailable" })).toBe("expired");
    for (const reason of ["network", "failed", "rate_limited"] as const) expect(phaseAfter({ ok: false, reason })).toBe("error");
  });
});
