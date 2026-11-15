/**
 * Turns one rendered storefront page (HTML) into plain readable text for the AI Agent. Pure and dependency free so it can be unit tested.
 * Only the page's <main> content is kept (no header, footer, menus), scripts, styles and hidden/template markup are dropped, entities are decoded, and
 * the result is capped. The text is the website's own public content exactly as a shopper sees it.
 */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "..." };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 8 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function htmlToPlainText(html: string, maxChars = 6000): string {
  const main = /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|template|noscript|svg|nav|form|button|select)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|ul|ol|table)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    // control characters never belong in shown text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars).trimEnd() + "..." : text;
}

/** The storefront pages the Agent may read: slug -> path. A fixed list, never taken from the request path. */
export const AI_SITE_PAGES: Readonly<Record<string, string>> = Object.freeze({
  about: "/about",
  contact: "/contact",
  faqs: "/faqs",
  "shipping-policy": "/shipping-policy",
  "returns-policy": "/returns-policy",
  "warranty-policy": "/warranty-policy",
  "privacy-policy": "/privacy-policy",
  terms: "/terms",
  wholesale: "/wholesale",
  "track-order": "/track-order",
});
