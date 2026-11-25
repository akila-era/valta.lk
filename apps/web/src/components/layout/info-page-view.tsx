import type { Metadata } from "next";
import { getInfoPage, pageDef } from "@/lib/info-pages";
import { InfoSections } from "./info-content";
import { PolicyPage } from "./policy-page";

/** Page metadata from the owner's saved title, or the default one. */
export async function infoMetadata(slug: string): Promise<Metadata> {
  const def = pageDef(slug);
  const { content } = await getInfoPage(slug);
  return { title: content.title, description: content.intro || undefined, alternates: { canonical: def?.path } };
}

/** An info page whose text the owner can edit in the admin (Admin > Promotions > Info Pages). */
export async function InfoPageView({ slug }: { slug: string }) {
  const { content } = await getInfoPage(slug);
  return (
    <PolicyPage title={content.title} intro={content.intro}>
      <InfoSections sections={content.sections} />
    </PolicyPage>
  );
}
