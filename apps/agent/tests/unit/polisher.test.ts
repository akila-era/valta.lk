import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OllamaClient } from "../../src/ollama/client";
import { acceptPolish, SinhalaPolisher } from "../../src/pipeline/polisher";
import { InferenceScheduler } from "../../src/queue/scheduler";
import { renderTemplate } from "../../src/router/templates";
import { startFakeOllama, type FakeOllama } from "../fake-ollama/server";

const ORIGINAL = renderTemplate("greeting", "si").text; // contains the Latin words VOLTA.LK
const GOOD = "ආයුබෝවන්! මම VOLTA.LK සාප්පු සහායකයායි. නිෂ්පාදන සොයන්න, සසඳන්න සහ තොග තත්ත්වය බලන්න ඔබට උදව් කරන්න මට පුළුවන්.";

describe("acceptPolish (what SinhalaLLM output is allowed to look like)", () => {
  it("accepts a Sinhala rewording that adds nothing new", () => {
    expect(acceptPolish(ORIGINAL, GOOD)).toEqual({ ok: true });
    expect(acceptPolish(ORIGINAL, ORIGINAL)).toEqual({ ok: true });
  });

  const reject: [string, string, string][] = [
    ["empty", "   ", "empty"],
    ["not Sinhala", "Hello! I am the VOLTA.LK shopping assistant and I can help you shop for products today.", "not_sinhala"],
    ["too short", "ආයුබෝවන් ඔබට හායි කියනවා", "length"],
    ["far too long", GOOD.repeat(3), "length"],
    ["a new number (a fabricated fact)", GOOD + " මිල 129900 ක් පමණයි.", "new_digits"],
    ["a new Sinhala digit", GOOD.replace("සහ", "සහ ෧෨") , "new_digits"],
    ["a link", GOOD + " https://evil.example", "link"],
    ["an email", GOOD + " info@example.lk", "link"],
    ["an invented English word (a product name)", GOOD + " Samsung", "new_latin_word"],
    ["a repeated phrase loop", "ආයුබෝවන් ඔබට උදව් කරන්න පුළුවන් ඔබට උදව් කරන්න පුළුවන් ඔබට උදව් කරන්න පුළුවන් ඔබට උදව් කරන්න පුළුවන් VOLTA.LK", "repetition"],
    ["a single word repeated", "ආයුබෝවන් ආයුබෝවන් ආයුබෝවන් ආයුබෝවන් ආයුබෝවන් VOLTA.LK සාප්පු සහායකයා ඔබට උදව් කරන්න", "repetition"],
    ["several lines", GOOD + "\n\n1.\n2.\n3.", "multiline"],
  ];
  for (const [name, text, reason] of reject) {
    it(`rejects ${name}`, () => {
      const v = acceptPolish(ORIGINAL, text);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe(reason);
    });
  }

  it("does not trust digits that were already in the original, but still blocks new ones", () => {
    const withDigit = "කරුණාකර 2 වතාවක් උත්සාහ කරන්න. VOLTA.LK";
    expect(acceptPolish(withDigit, withDigit).ok).toBe(true);
    expect(acceptPolish(withDigit, withDigit.replace("2", "9")).ok).toBe(false);
  });
});

describe("SinhalaPolisher (against the fake Ollama)", () => {
  let fake: FakeOllama;
  beforeEach(async () => {
    fake = await startFakeOllama();
  });
  afterEach(async () => {
    await fake.close();
  });
  const make = () => {
    const scheduler = new InferenceScheduler({ maxQueued: 5 });
    return { scheduler, polisher: new SinhalaPolisher({ ollama: new OllamaClient({ baseUrl: fake.url }), scheduler }) };
  };
  const opts = () => ({ priority: "guest" as const, deadlineAt: Date.now() + 20_000, signal: new AbortController().signal });

  it("uses SinhalaLLM only, with no system prompt and no tools, and accepts a safe rewording", async () => {
    fake.setResponder(() => ({ content: GOOD }));
    const r = await make().polisher.polish(ORIGINAL, opts());
    expect(r).toEqual({ text: GOOD, polished: true });
    expect(fake.requests[0]).toMatchObject({ model: "hf.co/namindu94/SinhalaLLM-1.7B:Q4_K_M", hasSystem: false, hasTools: false });
  });

  it("falls back to the original template whenever the output is unsafe", async () => {
    for (const bad of ["", "Hello there friend, how are you today my dear", GOOD + " 12345", GOOD + " https://x.example"]) {
      fake.setResponder(() => ({ content: bad }));
      const r = await make().polisher.polish(ORIGINAL, opts());
      expect(r.text).toBe(ORIGINAL);
      expect(r.polished).toBe(false);
    }
  });

  it("falls back on any error, and when busy with the other model", async () => {
    fake.setMode("http500");
    expect(await make().polisher.polish(ORIGINAL, opts())).toMatchObject({ text: ORIGINAL, polished: false, reason: "error" });
    fake.setMode("ok");

    const { scheduler, polisher } = make();
    scheduler.setLoaded("qwen");
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const busy = scheduler.submit({ model: "qwen", priority: "guest", deadlineAt: Date.now() + 30_000, run: () => hold });
    await new Promise((r) => setTimeout(r, 10));
    expect(await polisher.polish(ORIGINAL, opts())).toMatchObject({ text: ORIGINAL, polished: false, reason: "busy" });
    release();
    await busy;
  });
});
