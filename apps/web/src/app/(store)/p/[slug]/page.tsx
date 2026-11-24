import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPage } from "@/components/layout/policy-page";
import { SimpleText } from "@/components/ui/simple-text";
import { getPage } from "@/lib/site-content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return page?.custom ? { title: page.title, alternates: { canonical: `/p/${(await params).slug}` } } : {};
}

/** A page staff created in the admin (Content, Pages), e.g. giveaway terms. */
export default async function CustomPage({ params }: Props) {
  const page = await getPage((await params).slug);
  if (!page?.custom) notFound();
  return (
    <PolicyPage title={page.title} intro={page.intro || undefined}>
      <section>
        <SimpleText text={page.body} />
      </section>
    </PolicyPage>
  );
}
