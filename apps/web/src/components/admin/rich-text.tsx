"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, Pilcrow, RemoveFormatting } from "lucide-react";

const TOOLS = [
  { icon: Heading2, label: "Heading", cmd: "formatBlock", arg: "h2" },
  { icon: Heading3, label: "Sub-heading", cmd: "formatBlock", arg: "h3" },
  { icon: Pilcrow, label: "Paragraph", cmd: "formatBlock", arg: "p" },
  { icon: Bold, label: "Bold", cmd: "bold", arg: undefined },
  { icon: Italic, label: "Italic", cmd: "italic", arg: undefined },
  { icon: List, label: "Bulleted list", cmd: "insertUnorderedList", arg: undefined },
  { icon: ListOrdered, label: "Numbered list", cmd: "insertOrderedList", arg: undefined },
] as const;

/**
 * Small rich-text editor for product descriptions: headings, paragraphs, bold/italic, lists and links.
 * Pasting always inserts plain text (no stray styles from Word/web pages). The server sanitises the HTML again on save
 * and on render, so this component is a convenience, not a security boundary.
 */
export function RichText({ value, onChange, label, onUploadImage }: { value: string; onChange: (html: string) => void; label: string; /** Uploads one picture and returns its address; when given, the toolbar gets an "Add image" button. */ onUploadImage?: (file: File) => Promise<string | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
    // set once on mount: afterwards the DOM is the source of truth while typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? "");
  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const remember = () => {
    const sel = window.getSelection();
    saved.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  };
  const restore = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (sel && saved.current) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  async function addImages(files: FileList | null) {
    if (!files?.length || !onUploadImage) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const url = await onUploadImage(file);
      if (!url) continue;
      restore();
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 100).replace(/"/g, "");
      document.execCommand("insertHTML", false, `<p><img src="${url}" alt="${alt}"></p>`);
      emit();
      remember();
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const btn = "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-surface";
  return (
    <div className="rounded-lg border border-border bg-bg focus-within:border-ink">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-border p-1.5">
        {TOOLS.map((t) => (
          <button key={t.label} type="button" className={btn} aria-label={t.label} title={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd, t.arg)}>
            <t.icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
        <button type="button" className={btn} aria-label="Add link" title="Add link" onMouseDown={(e) => e.preventDefault()} onClick={() => { remember(); setLink("https://"); }}>
          <Link2 className="h-4 w-4" aria-hidden />
        </button>
        {onUploadImage && (
          <>
            <button type="button" className={btn} aria-label="Add image" title="Add image" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => { remember(); fileRef.current?.click(); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void addImages(e.target.files)} />
          </>
        )}
        <button type="button" className={btn} aria-label="Remove formatting" title="Remove formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => { run("removeFormat"); run("formatBlock", "p"); }}>
          <RemoveFormatting className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {link !== null && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2">
          <label htmlFor="rt-link" className="sr-only">Link address</label>
          <input id="rt-link" value={link} onChange={(e) => setLink(e.target.value)} className="input min-h-9 max-w-md flex-1" placeholder="https://example.com" />
          <button type="button" className="btn-primary min-h-9 px-3" onClick={() => { restore(); if (/^(https?:\/\/|mailto:|tel:)/i.test(link)) run("createLink", link); setLink(null); }}>Add link</button>
          <button type="button" className="btn-ghost min-h-9 px-3" onClick={() => setLink(null)}>Cancel</button>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        className="rich min-h-48 max-h-[32rem] overflow-y-auto p-4 outline-none"
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
