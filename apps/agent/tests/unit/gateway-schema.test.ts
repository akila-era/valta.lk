import { describe, expect, it } from "vitest";
import { toGeminiFunctionDeclaration } from "../../src/gateway/schema";

const tool = (parameters: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ name: "t", description: "A tool.", parameters, ...over });
const obj = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: "object", properties, ...extra });

describe("tool schema conversion", () => {
  it("accepts the supported subset and passes the schema through as parametersJsonSchema", () => {
    const params = obj({ query: { type: "string", description: "Words to search for" }, max: { type: "integer", minimum: 1, maximum: 8 }, sort: { type: "string", enum: ["price_asc", "price_desc"] }, tags: { type: "array", items: { type: "string" } }, inStock: { type: "boolean" } }, { required: ["query"] });
    expect(toGeminiFunctionDeclaration(tool(params))).toEqual({ name: "t", description: "A tool.", parametersJsonSchema: params });
  });
  it("accepts a tool with no parameters", () => {
    expect(toGeminiFunctionDeclaration(tool(obj({}))).parametersJsonSchema).toEqual(obj({}));
  });

  const unsupported: [string, Record<string, unknown>][] = [
    ["anyOf", obj({ a: { anyOf: [{ type: "string" }] } })],
    ["oneOf", obj({ a: { oneOf: [{ type: "string" }] } })],
    ["allOf", obj({ a: { allOf: [{ type: "string" }] } })],
    ["$ref", obj({ a: { $ref: "#/x" } })],
    ["not", obj({ a: { not: { type: "string" } } })],
    ["unknown type", obj({ a: { type: "null" } })],
    ["missing type", obj({ a: { description: "x" } })],
    ["array without items", obj({ a: { type: "array" } })],
    ["items on a string", obj({ a: { type: "string", items: { type: "string" } } })],
    ["properties on a string", obj({ a: { type: "string", properties: {} } })],
    ["required name not in properties", obj({ a: { type: "string" } }, { required: ["b"] })],
    ["empty enum", obj({ a: { type: "string", enum: [] } })],
    ["object in enum", obj({ a: { type: "string", enum: [{}] } })],
  ];
  for (const [name, params] of unsupported) {
    it(`rejects ${name} with a fixed code`, () => {
      expect(() => toGeminiFunctionDeclaration(tool(params))).toThrow(/unsupported_schema/);
    });
  }
  // Advisory constraints are removed from what is sent (the model does not enforce them; the tool executor enforces them in full on the original schema).
  const advisory: [string, Record<string, unknown>, string][] = [
    ["additionalProperties", obj({}, { additionalProperties: false }), "additionalProperties"],
    ["pattern", obj({ a: { type: "string", pattern: "^x$" } }), "pattern"],
    ["minLength", obj({ a: { type: "string", minLength: 1 } }), "minLength"],
    ["maxLength", obj({ a: { type: "string", maxLength: 9 } }), "maxLength"],
    ["uniqueItems", obj({ a: { type: "array", items: { type: "string" }, uniqueItems: true } }), "uniqueItems"],
  ];
  for (const [name, params, key] of advisory) {
    it(`removes ${name} from what is sent and leaves the original schema untouched`, () => {
      const before = JSON.stringify(params);
      const out = toGeminiFunctionDeclaration(tool(params));
      expect(JSON.stringify(out.parametersJsonSchema)).not.toContain(`"${key}"`);
      expect(JSON.stringify(params)).toBe(before);
    });
  }
  it("a PROPERTY that happens to be named like an advisory keyword is kept", () => {
    const out = toGeminiFunctionDeclaration(tool(obj({ pattern: { type: "string", maxLength: 5 }, maxLength: { type: "integer" } })));
    const props = (out.parametersJsonSchema as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(Object.keys(props).sort()).toEqual(["maxLength", "pattern"]);
    expect(props.pattern).toEqual({ type: "string" });
  });
  it("rejects a root that is not an object, too deep a schema, too many properties and too long an enum", () => {
    expect(() => toGeminiFunctionDeclaration(tool({ type: "string" }))).toThrow(/root_must_be_object/);
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 8; i++) deep = obj({ x: deep });
    expect(() => toGeminiFunctionDeclaration(tool(deep))).toThrow(/too_deep/);
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`p${i}`, { type: "string" }]));
    expect(() => toGeminiFunctionDeclaration(tool(obj(many)))).toThrow(/too_many_properties/);
    expect(() => toGeminiFunctionDeclaration(tool(obj({ a: { type: "string", enum: Array.from({ length: 51 }, (_, i) => `v${i}`) } })))).toThrow(/enum/);
  });
  it("rejects invalid tool names and descriptions", () => {
    for (const name of ["", "1abc", "has space", "a".repeat(65), "semi;colon"]) expect(() => toGeminiFunctionDeclaration(tool(obj({}), { name }))).toThrow(/unsupported_schema:name/);
    for (const description of ["", "d".repeat(2_001)]) expect(() => toGeminiFunctionDeclaration(tool(obj({}), { description }))).toThrow(/unsupported_schema:description/);
  });
});
