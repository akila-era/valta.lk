import Link from "next/link";
import type { ReactNode } from "react";

/** Inline markup: **bold** and [text](/internal-path or https://link). Everything else is plain text, so nothing can inject HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*|https:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={i++} className="font-semibold text-ink">{m[1]}</strong>);
    else if (m[3].startsWith("/")) out.push(<Link key={i++} href={m[3]} className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">{m[2]}</Link>);
    else out.push(<a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">{m[2]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Blocks of one section body: paragraphs, "- " bullet lists and "1. " numbered lists. */
export function Body({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^[-*] /, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+[.)] /.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1.5 pl-5 text-muted marker:font-semibold marker:text-brand-600">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\d+[.)] /, ""))}</li>
              ))}
            </ol>
          );
        }
        return <p key={bi}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

/** The sections of an info page, each as its own card (the page layout styles the section, its heading and its text). */
export function InfoSections({ sections }: { sections: { heading: string; body: string }[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <section key={`${s.heading}-${i}`}>
          <h2>{s.heading}</h2>
          <div className="space-y-3">
            <Body text={s.body} />
          </div>
        </section>
      ))}
    </>
  );
}
