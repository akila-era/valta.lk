import { ChevronDown } from "lucide-react";

/** Native, keyboard-friendly accordion row (no JavaScript needed). */
export function Accordion({ id, title, children, defaultOpen = false }: { id?: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-32 border-b border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-5 text-[15px] leading-6">{children}</div>
    </details>
  );
}
