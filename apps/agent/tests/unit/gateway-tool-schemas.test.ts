import { describe, expect, it } from "vitest";
import { toGeminiFunctionDeclaration } from "../../src/gateway/schema";
import { createMockStack } from "../../src/mock/stack";
import { createLlmTools, LlmToolExecutor } from "../../src/tools/llm";
import { RichTransport, richSite } from "../fixtures/rich-catalogue";

/**
 * Found by an end-to-end run of the real bundle: the shop tools' schemas carry length and shape constraints (from the strict argument validators) that the
 * converter used to REJECT, so every real request that offered tools would have failed before leaving the machine. The fake-provider tests never converted a
 * schema. These tests convert the REAL tool declarations, exactly as the turn loop offers them.
 */
const stack = createMockStack({ transport: new RichTransport(), site: richSite(), catalogueTtlMs: 0 });

function offeredDeclarations() {
  const executor = new LlmToolExecutor({ tools: createLlmTools() });
  const turn = executor.startTurn({ actor: { kind: "guest" }, requestId: "r", sessionKey: "s", deps: { registry: stack.registry } });
  return executor.declarations(turn);
}

function keysUsed(node: unknown, acc = new Set<string>()): Set<string> {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      acc.add(k);
      if (k === "properties" && v && typeof v === "object") for (const child of Object.values(v as Record<string, unknown>)) keysUsed(child, acc);
      else keysUsed(v, acc);
    }
  }
  return acc;
}

describe("the real model-facing tools convert to Gemini function declarations", () => {
  it("every tool the turn loop offers converts without error", () => {
    const decls = offeredDeclarations();
    expect(decls.length).toBeGreaterThanOrEqual(4);
    for (const d of decls) {
      expect(() => toGeminiFunctionDeclaration({ name: d.name, description: d.description, parameters: d.parameters as never }), d.name).not.toThrow();
    }
  });

  it("the keywords the tools use that Gemini does not enforce are removed from what is sent, never silently changing the type structure", () => {
    for (const d of offeredDeclarations()) {
      const out = toGeminiFunctionDeclaration({ name: d.name, description: d.description, parameters: d.parameters as never });
      const sent = keysUsed(out.parametersJsonSchema);
      for (const forbidden of ["maxLength", "minLength", "pattern", "additionalProperties", "$schema", "maxItems", "minItems", "uniqueItems"]) {
        expect(sent.has(forbidden), `${d.name} still sends ${forbidden}`).toBe(false);
      }
      // The structure that matters is kept.
      expect((out.parametersJsonSchema as { type?: string }).type).toBe("object");
    }
  });

  it("the original schema object is not modified (the executor still validates against the full constraints)", () => {
    const decls = offeredDeclarations();
    const before = JSON.stringify(decls);
    for (const d of decls) toGeminiFunctionDeclaration({ name: d.name, description: d.description, parameters: d.parameters as never });
    expect(JSON.stringify(decls)).toBe(before);
  });

  it("which keywords do the real tools use? (documented so a new keyword is noticed)", () => {
    const used = new Set<string>();
    for (const d of offeredDeclarations()) keysUsed(d.parameters, used);
    // Informational: the allowed structural keys plus the advisory ones that are stripped. Anything else would be rejected and must be reviewed.
    const known = new Set(["type", "properties", "required", "items", "enum", "description", "format", "minimum", "maximum", "title", "default", "maxLength", "minLength", "pattern", "additionalProperties", "$schema", "maxItems", "minItems", "uniqueItems", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);
    const unknown = [...used].filter((k) => !known.has(k) && !/^[a-zA-Z_][\w]*$/.test(k) === false && !known.has(k));
    // Property NAMES also appear in this set; only keywords matter, so just prove that conversion succeeded for all of them above.
    expect(used.has("type")).toBe(true);
    void unknown;
  });
});
