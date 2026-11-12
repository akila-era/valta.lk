import { afterEach, describe, expect, it } from "vitest";
import AssistantDemoPage from "@/app/(store)/assistant-demo/page";

const original = process.env.ASSISTANT_DEMO_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.ASSISTANT_DEMO_ENABLED;
  else process.env.ASSISTANT_DEMO_ENABLED = original;
});

describe("assistant demo page gate", () => {
  it("answers 404 unless ASSISTANT_DEMO_ENABLED is exactly true", () => {
    for (const v of [undefined, "", "false", "TRUE", "1", "yes"]) {
      if (v === undefined) delete process.env.ASSISTANT_DEMO_ENABLED;
      else process.env.ASSISTANT_DEMO_ENABLED = v;
      expect(() => AssistantDemoPage(), String(v)).toThrow();
    }
  });
  it("renders when enabled", () => {
    process.env.ASSISTANT_DEMO_ENABLED = "true";
    expect(AssistantDemoPage()).toBeTruthy();
  });
});
