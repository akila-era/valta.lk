/**
 * Allow-list HTML sanitiser for product descriptions (no dependencies, runs on server and client).
 * The output is rebuilt from scratch: only the tags below are emitted, `a` keeps only a safe href, every other tag and
 * attribute is dropped (their text is kept), and script/style contents are removed entirely. Run on save AND on render.
 */
const BLOCK = new Set(["p", "h2", "h3", "ul", "ol", "li", "blockquote"]);
const INLINE = new Set(["strong", "em", "br"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", h1: "h2", h4: "h3", h5: "h3", h6: "h3", div: "p" };
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

function safeHref(raw: string): string | null {
  const v = raw.replace(/[\u0000- \u007f-\u009f]/g, "").replace(/&#x?[0-9a-f]+;?/gi, "");
  if (!SAFE_URL.test(v)) return null;
  try {
    new URL(v);
  } catch {
    return null;
  }
  return v.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E");
}

const escapeText = (t: string) => t.replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeHtml(input: string, maxLength = 20_000): string {
  const html = String(input ?? "").slice(0, maxLength * 2).replace(/<!--[\s\S]*?-->/g, "").replace(DROP_WITH_CONTENT, "");
  const out: string[] = [];
  const open: string[] = [];
  const tag = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const close = (name: string) => {
    const i = open.lastIndexOf(name);
    if (i === -1) return;
    while (open.length > i) out.push(`</${open.pop()}>`);
  };
  while ((m = tag.exec(html))) {
    out.push(escapeText(html.slice(last, m.index)));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    let name = m[2].toLowerCase();
    name = RENAME[name] ?? name;
    if (name === "br") {
      if (!closing) out.push("<br>");
    } else if (BLOCK.has(name) || INLINE.has(name)) {
      if (closing) close(name);
      else {
        if ((name === "li") && open.at(-1) === "li") close("li");
        out.push(`<${name}>`);
        open.push(name);
      }
    } else if (name === "a") {
      if (closing) close("a");
      else {
        const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
        const url = href ? safeHref(href[1] ?? href[2] ?? href[3] ?? "") : null;
        if (url) {
          out.push(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">`);
          open.push("a");
        }
      }
    }
    // any other tag is dropped; its text content is kept
  }
  out.push(escapeText(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("").replace(/<(p|h2|h3|li|strong|em)>\s*<\/\1>/g, "").trim().slice(0, maxLength);
}

/** Plain text of sanitised HTML (for meta descriptions and "is there any content" checks). */
export const htmlToText = (html: string) => html.replace(/<br>|<\/(p|h2|h3|li|blockquote)>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
