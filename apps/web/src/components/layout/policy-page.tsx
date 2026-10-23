import type { ReactNode } from "react";

export function PolicyPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="page-title">{title}</h1>
      {intro && <p className="mt-3 text-base text-muted">{intro}</p>}
      <div className="mt-8 space-y-8 text-sm leading-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted">
        {children}
      </div>
    </article>
  );
}
