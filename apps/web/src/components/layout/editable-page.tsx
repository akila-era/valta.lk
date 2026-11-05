import type { ReactNode } from "react";
import { SimpleText } from "@/components/ui/simple-text";
import { getPage } from "@/lib/site-content";
import { PolicyPage } from "./policy-page";

/**
 * A text page staff can rewrite in the admin (Content, Pages). Until they save it, the page's built-in text
 * (`children`) is shown unchanged.
 */
export async function EditablePage({ slug, children }: { slug: string; children: ReactNode }) {
  const saved = await getPage(slug);
  if (!saved) return <>{children}</>;
  return (
    <PolicyPage title={saved.title} intro={saved.intro || undefined}>
      <section>
        <SimpleText text={saved.body} />
      </section>
    </PolicyPage>
  );
}
