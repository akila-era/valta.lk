import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders the simple formatting staff type in the admin (no HTML is ever passed through):
 *   ## Heading        ### Smaller heading
 *   - list item       (lines starting with "- ")
 *   **bold**          [link text](/page or https://…)
 * Blank lines separate paragraphs.
 */
export function SimpleText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.startsWith("### ")) return <h3 key={i} className="mt-2 text-lg font-semibold text-ink">{inline(b.slice(4))}</h3>;
        if (b.startsWith("## ")) return <h2 key={i}>{inline(b.slice(3))}</h2>;
        const lines = b.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i}>
              {lines.map((l, k) => <li key={k}>{inline(l.trim().slice(2))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, k) => <span key={k}>{k > 0 ? <br /> : null}{inline(l)}</span>)}</p>;
      })}
    </>
  );
}

const SAFE_URL = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d][\d\s-]*)$/;

/** **bold** and [text](url); anything else stays plain text. */
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (SAFE_URL.test(m[3])) {
      out.push(
        m[3].startsWith("/") ? <Link key={m.index} href={m[3]}>{m[2]}</Link> : <a key={m.index} href={m[3]} target={m[3].startsWith("https:") ? "_blank" : undefined} rel="noopener noreferrer">{m[2]}</a>,
      );
    } else out.push(m[2]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
