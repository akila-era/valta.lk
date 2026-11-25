import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "@/lib/videos";

describe("parseYouTubeId", () => {
  const id = "dQw4w9WgXcQ";
  it.each([
    [`https://www.youtube.com/watch?v=${id}`],
    [`https://youtube.com/watch?v=${id}&t=10s`],
    [`https://youtu.be/${id}?si=abc`],
    [`https://m.youtube.com/watch?v=${id}`],
    [`https://www.youtube.com/embed/${id}`],
    [`https://www.youtube.com/shorts/${id}`],
    [`www.youtube.com/watch?v=${id}`],
    [id],
  ])("reads the id from %s", (input) => {
    expect(parseYouTubeId(input)).toBe(id);
  });

  it.each([[""], ["https://example.com/watch?v=dQw4w9WgXcQ"], ["https://www.youtube.com/watch?v=short"], ["https://www.youtube.com/"], ["not a link at all"]])("rejects %s", (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});
