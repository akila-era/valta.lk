import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/router/language";

describe("detectLanguage", () => {
  it("sends any Sinhala script to the deterministic (sinhala) path", () => {
    expect(detectLanguage("ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?")).toMatchObject({ script: "si", language: "si", path: "sinhala" });
    expect(detectLanguage("මට phone එකක් ඕන")).toMatchObject({ script: "mixed", language: "mixed", path: "sinhala" });
  });

  it("recognises Singlish and routes it deterministically, labelled mixed", () => {
    for (const s of ["phone ekak ganna one", "meka stock eke thiyenawada?", "mage order eka koheda", "delivery charge eka kiyada"]) {
      expect(detectLanguage(s), s).toMatchObject({ script: "si-latin", language: "mixed", path: "sinhala" });
    }
  });

  it("keeps ordinary English on the english path", () => {
    for (const s of ["Show me phones under 150000 rupees", "Compare Nova X1 and Orbit Pro", "I want one phone", "Where is my order?", "ok"]) {
      expect(detectLanguage(s), s).toMatchObject({ script: "en", language: "en", path: "english" });
    }
  });

  it("does not let the weak word 'one' alone turn English into Singlish, but two weak markers do", () => {
    expect(detectLanguage("I need one charger").path).toBe("english");
    expect(detectLanguage("oya mama one").path).toBe("sinhala");
  });

  it("uses the locale only as a tie-break for Latin text, never to override script", () => {
    expect(detectLanguage("show me phones", { locale: "si" })).toMatchObject({ path: "sinhala", script: "si-latin" });
    expect(detectLanguage("show me phones", { locale: "en" }).path).toBe("english");
    expect(detectLanguage("මට phone එකක් ඕන", { locale: "en" }).path).toBe("sinhala"); // Sinhala script always wins
  });

  it("handles digits-only, emoji-only and empty text without throwing", () => {
    for (const s of ["12345", "👍", "", "   "]) expect(() => detectLanguage(s)).not.toThrow();
    expect(detectLanguage("12345").path).toBe("english");
  });
});
