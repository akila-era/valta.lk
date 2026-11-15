import { stripInvisible } from "../tools/llm/fence";

/**
 * Turns a fetched page into bounded readable text. No DOM library: a small tokenizer that walks tags with a stack. It drops everything a visitor would not read
 * (scripts, styles, templates, navigation, footers, asides, forms, anything hidden by an attribute or an inline style), decodes entities, removes invisible
 * characters and caps the length. It is a defence in depth, not a promise: text that is merely low-contrast or positioned oddly by an external stylesheet cannot be
 * detected here, which is why the result is ALWAYS fenced as untrusted data and scanned for instructions afterwards (see injection.ts).
 */
export interface ExtractedPage {
  title: string;
  text: string;
  truncated: boolean;
  /** Elements dropped because they were hidden (counted, never shown). */
  droppedHidden: number;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const DROP = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "head", "nav", "footer", "aside", "form", "select", "button", "dialog"]);
const BLOCK = new Set(["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "main", "ul", "ol", "table", "blockquote", "pre", "dl", "dt", "dd", "figure", "figcaption", "hr"]);

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?(?![.\d])|font-size\s*:\s*0(?:px|em|rem|pt|%)?(?![.\d])|(?:left|top|text-indent)\s*:\s*-\d{3,}|height\s*:\s*0(?:px)?\s*;?[^"']*overflow\s*:\s*hidden|clip\s*:\s*rect\(\s*0/i;

function attrValue(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|$|/)`, "i").exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

function isHidden(attrs: string): boolean {
  if (attrValue(attrs, "hidden") !== null) return true;
  if ((attrValue(attrs, "aria-hidden") ?? "").toLowerCase() === "true") return true;
  const style = attrValue(attrs, "style");
  return style !== null && HIDDEN_STYLE.test(style);
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", copy: "(c)", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, body: string) => {
    if (body[0] === "#") {
      const code = body[1]!.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // a lone surrogate half is not a character: it decodes to nothing
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }
    return NAMED[body.toLowerCase()] ?? all;
  });
}

const MAX_INPUT = 1_000_000;
/** Longest tag (name and attributes) that is read as a tag. A real tag is far shorter; an unclosed `<a "...` run is then text, not a search to the end of the page. */
const MAX_TAG = 2_048;

interface Tok {
  /** The raw text for a text token; the whole tag for a tag token. */
  whole: string;
  /** "/" for a closing tag. Undefined for text. */
  closing?: string;
  /** Lower-case tag name. Undefined for text. */
  tag?: string;
  attrs: string;
}

/**
 * A LINEAR tokenizer (replaces a regular expression that was quadratic on unclosed tags: a hostile page of `<a "` repeated could hold the single-threaded Agent
 * for minutes). Every tag attempt reads at most MAX_TAG characters, and the whole run has a work budget; when the budget is spent the rest of the page is treated as
 * text (it is still cleaned, capped, fenced as untrusted data and scanned for instructions afterwards). Comments, CDATA, declarations and processing
 * instructions are dropped; an unterminated comment runs to the end of the page, as in a browser.
 */
function* tokenize(input: string): Generator<Tok> {
  const n = input.length;
  let budget = Math.max(200_000, n * 12);
  let i = 0;
  while (i < n) {
    const lt = input.indexOf("<", i);
    if (lt < 0) {
      yield { whole: input.slice(i), attrs: "" };
      return;
    }
    if (lt > i) yield { whole: input.slice(i, lt), attrs: "" };
    i = lt;
    if (budget <= 0) {
      yield { whole: input.slice(i), attrs: "" };
      return;
    }
    if (input.startsWith("<!--", i)) {
      const e = input.indexOf("-->", i + 4);
      budget -= (e < 0 ? n : e) - i;
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", i)) {
      const e = input.indexOf("]]>", i + 9);
      budget -= (e < 0 ? n : e) - i;
      i = e < 0 ? n : e + 3;
      continue;
    }
    const next = input[i + 1];
    if (next === "!" || next === "?") {
      const e = input.indexOf(">", i + 2);
      budget -= (e < 0 ? n : e) - i;
      i = e < 0 ? n : e + 1;
      continue;
    }
    let j = i + 1;
    const closing = next === "/" ? "/" : "";
    if (closing) j++;
    if (!/[a-zA-Z]/.test(input[j] ?? "")) {
      yield { whole: "<", attrs: "" };
      i++;
      continue;
    }
    const nameStart = j;
    while (j < n && j - nameStart < 64 && /[a-zA-Z0-9-]/.test(input[j]!)) j++;
    const nameEnd = j;
    const limit = Math.min(n, nameEnd + MAX_TAG);
    let quote = 0;
    let found = false;
    for (; j < limit; j++) {
      const c = input.charCodeAt(j);
      if (quote !== 0) {
        if (c === quote) quote = 0;
      } else if (c === 34 || c === 39) quote = c;
      else if (c === 62) {
        found = true;
        break;
      }
    }
    budget -= j - i + 1;
    if (!found) {
      yield { whole: "<", attrs: "" };
      i++;
      continue;
    }
    yield { whole: input.slice(i, j + 1), closing, tag: input.slice(nameStart, nameEnd).toLowerCase(), attrs: input.slice(nameEnd, j) };
    i = j + 1;
  }
}

export function extractReadableText(html: string, opts: { maxChars?: number } = {}): ExtractedPage {
  const maxChars = opts.maxChars ?? 6_000;
  const input = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;
  const titleMatch = /<title[^>]{0,200}>([\s\S]{0,500}?)<\/title>/i.exec(input.slice(0, 200_000));
  // Invisible characters are removed AFTER entities are decoded too: `&#x202E;`, `&#x200B;` or a tag character written as a numeric entity would otherwise survive.
  const title = titleMatch ? stripInvisible(decodeEntities(stripInvisible(titleMatch[1]!))).replace(/\s+/g, " ").trim().slice(0, 200) : "";

  const out: string[] = [];
  let chars = 0;
  let droppedHidden = 0;
  let skip: { tag: string; depth: number } | null = null;
  let truncated = false;

  const emit = (s: string): void => {
    if (truncated) return;
    out.push(s);
    chars += s.length;
    if (chars > maxChars * 3) truncated = true; // enough raw material: stop early on huge pages
  };

  for (const tok of tokenize(input)) {
    if (truncated) break;
    const tag = tok.tag;
    if (!tag) {
      if (!skip) emit(tok.whole);
      continue;
    }
    const closing = tok.closing === "/";
    const attrs = tok.attrs;
    const selfClosed = attrs.trimEnd().endsWith("/") || VOID.has(tag);

    if (skip) {
      if (tag === skip.tag && !selfClosed) {
        if (closing) {
          if (--skip.depth === 0) skip = null;
        } else skip.depth++;
      }
      continue;
    }
    if (closing) {
      if (BLOCK.has(tag)) emit("\n");
      continue;
    }
    const hidden = isHidden(attrs) || (tag === "input" && (attrValue(attrs, "type") ?? "").toLowerCase() === "hidden");
    if (hidden || DROP.has(tag)) {
      if (hidden) droppedHidden++;
      if (!selfClosed) skip = { tag, depth: 1 };
      continue;
    }
    if (tag === "br" || BLOCK.has(tag)) emit("\n");
    if (tag === "li") emit("- ");
  }

  let text = stripInvisible(decodeEntities(stripInvisible(out.join(""))))
    .replace(/[ \t\f\v\u00A0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > maxChars) {
    truncated = true;
    let end = maxChars;
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    text = text.slice(0, end).trimEnd();
  }
  return { title, text, truncated, droppedHidden };
}

/** A plain-text response needs no tag handling, only cleaning and the cap. */
export function extractPlainText(raw: string, opts: { maxChars?: number } = {}): ExtractedPage {
  const maxChars = opts.maxChars ?? 6_000;
  let text = stripInvisible(raw.slice(0, MAX_INPUT)).replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  let truncated = false;
  if (text.length > maxChars) {
    truncated = true;
    text = text.slice(0, maxChars).trimEnd();
  }
  return { title: "", text, truncated, droppedHidden: 0 };
}
