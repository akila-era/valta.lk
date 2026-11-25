import { describe, expect, it } from "vitest";
import { descriptionMediaIds, sanitizeHtml } from "@/lib/content/sanitize";

describe("description images", () => {
  it("keeps a picture uploaded through the admin and nothing else", () => {
    const ok = sanitizeHtml('<p>Hi</p><p><img src="/api/media/cmabc123456789" alt="Front view" onerror="x()"></p>');
    expect(ok).toBe('<p>Hi</p><p><img src="/api/media/cmabc123456789" alt="Front view" loading="lazy"></p>');
  });

  it("drops images from other places", () => {
    for (const src of ["https://evil.example/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/api/media/../../etc/passwd", "//evil.example/x.png"]) {
      expect(sanitizeHtml(`<p>a<img src="${src}">b</p>`)).toBe("<p>ab</p>");
    }
  });

  it("makes an absolute address of this site relative and escapes the alt text", () => {
    expect(sanitizeHtml(`<img src="https://volta.lk/api/media/cmabc123456789" alt='a "b" &lt;c&gt;'>`)).toBe(`<img src="/api/media/cmabc123456789" alt="a &quot;b&quot; &lt;c&gt;" loading="lazy">`);
  });

  it("lists the pictures a description uses, so clean-up keeps them", () => {
    expect(descriptionMediaIds('<img src="/api/media/cmabc123456789"><p>x</p><img src="/api/media/cmzzz987654321">')).toEqual(["cmabc123456789", "cmzzz987654321"]);
  });
});
