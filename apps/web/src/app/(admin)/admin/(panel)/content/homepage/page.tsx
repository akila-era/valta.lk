import type { Metadata } from "next";
import { ContentListEditor } from "@/components/admin/content-list-editor";
import { PageHeader, Panel } from "@/components/admin/ui";
import { OPENER_DEFAULT, defaultStripItems, defaultWhyChoose } from "@/components/home/storefront";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getSettings } from "@/lib/erp/settings";
import { configuredReviews, configuredVideos } from "@/lib/home-config";
import { getContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "Homepage Content" };
export const dynamic = "force-dynamic";

/** Admin: the homepage words: the first banner slide, the strip under it, Why Choose, customer reviews and videos. */
export default async function HomepageContentAdmin() {
  const denied = await adminGate("/admin/content/homepage");
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const [opener, strip, why, reviews, videos, s] = await Promise.all([
    getContent("hero-opener"),
    getContent("service-strip"),
    getContent("why-choose"),
    getContent("home-reviews"),
    getContent("home-videos"),
    getSettings().catch(() => null),
  ]);
  const checkout = { cod: s?.paymentMethods.COD === true, deliveryCharge: s?.deliveryCharge ?? null };
  const envReviews = configuredReviews();
  const envVideos = configuredVideos();
  const o = opener ?? OPENER_DEFAULT;

  return (
    <>
      <PageHeader title="Homepage Content" subtitle="The words on the homepage. Each part keeps its built-in text until you save it. Pictures for banners are in Promotions, Promotional Banners." />
      <div className="space-y-6">
        <Panel title="First banner slide" id="opener">
          <ContentListEditor
            contentKey="hero-opener"
            single
            isDefault={!opener}
            max={1}
            min={1}
            initial={[{ eyebrow: o.eyebrow, title: o.title, text: o.text, cta: o.cta }]}
            fields={[
              { key: "eyebrow", label: "Small line above the title", optional: true },
              { key: "title", label: "Title" },
              { key: "text", label: "Text", type: "textarea", optional: true },
              { key: "cta", label: "Button label" },
            ]}
          />
        </Panel>
        <Panel title="Strip under the banner" id="strip">
          <ContentListEditor
            contentKey="service-strip"
            isDefault={!strip}
            max={6}
            min={1}
            initial={(strip?.items ?? defaultStripItems(checkout)).map((x) => ({ title: x.title, text: x.text }))}
            fields={[
              { key: "title", label: "Title" },
              { key: "text", label: "Small text", optional: true },
            ]}
          />
        </Panel>
        <Panel title="Why Choose cards" id="why">
          <ContentListEditor
            contentKey="why-choose"
            isDefault={!why}
            max={6}
            min={1}
            addLabel="Add card"
            initial={(why?.items ?? defaultWhyChoose(checkout)).map((x) => ({ title: x.title, text: x.text }))}
            fields={[
              { key: "title", label: "Title" },
              { key: "text", label: "Text", type: "textarea" },
            ]}
          />
        </Panel>
        <Panel title="Customer reviews" id="reviews">
          <p className="mb-3 text-sm text-muted">Only real reviews, for example copied from your Google reviews, with where they were posted.</p>
          <ContentListEditor
            contentKey="home-reviews"
            isDefault={!reviews}
            max={6}
            addLabel="Add review"
            title={{ label: "Section title", value: reviews?.title || envReviews.title }}
            initial={(reviews?.items ?? envReviews.reviews).map((r) => ({ name: r.name, rating: String(r.rating), text: r.text, source: r.source ?? "", date: r.date ?? "" }))}
            fields={[
              { key: "name", label: "Name" },
              { key: "rating", label: "Stars (1 to 5)", type: "number" },
              { key: "text", label: "Review", type: "textarea" },
              { key: "source", label: "Where it was posted", optional: true, hint: "e.g. Google" },
              { key: "date", label: "Date", optional: true },
            ]}
          />
        </Panel>
        <Panel title="Videos" id="videos">
          <ContentListEditor
            contentKey="home-videos"
            isDefault={!videos}
            max={4}
            addLabel="Add video"
            title={{ label: "Section title", value: videos?.title || envVideos.title }}
            initial={(videos?.items ?? envVideos.videos).map((v) => ({ id: v.id, title: v.title, channel: v.channel ?? "" }))}
            fields={[
              { key: "id", label: "YouTube video id", hint: "The 11 characters after watch?v= in the video link" },
              { key: "title", label: "Title" },
              { key: "channel", label: "Channel", optional: true },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
