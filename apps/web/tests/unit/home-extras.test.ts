import { describe, expect, it } from "vitest";
import { parseSocialUrl } from "@/lib/home-extras";

describe("parseSocialUrl", () => {
  it("reads Instagram posts and reels and builds the embed address", () => {
    expect(parseSocialUrl("https://www.instagram.com/p/CxYz123AbC/?igsh=abc")).toEqual({
      platform: "instagram",
      url: "https://www.instagram.com/p/CxYz123AbC/",
      embedUrl: "https://www.instagram.com/p/CxYz123AbC/embed",
    });
    expect(parseSocialUrl("instagram.com/reel/Cabcde12345/")?.url).toBe("https://www.instagram.com/reel/Cabcde12345/");
    expect(parseSocialUrl("https://www.instagram.com/volta.lk/reel/Cabcde12345/")?.platform).toBe("instagram");
  });

  it("reads TikTok videos", () => {
    expect(parseSocialUrl("https://www.tiktok.com/@volta.lk/video/7234567890123456789?lang=en")).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@volta.lk/video/7234567890123456789",
      embedUrl: "https://www.tiktok.com/embed/v2/7234567890123456789",
    });
  });

  it.each([[""], ["https://example.com/p/abcdef"], ["https://www.instagram.com/volta.lk/"], ["https://www.tiktok.com/@volta.lk"], ["https://vm.tiktok.com/abc"], ["javascript:alert(1)"]])("rejects %s", (input) => {
    expect(parseSocialUrl(input)).toBeNull();
  });
});
