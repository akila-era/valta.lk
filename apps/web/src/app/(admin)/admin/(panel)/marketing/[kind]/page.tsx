import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BannerManager, type BannerRow } from "@/components/admin/banner-manager";
import { InfoPagesEditor, type EditorPage } from "@/components/admin/info-pages-editor";
import { WholesaleManager, type ApplicationRow } from "@/components/admin/wholesale-manager";
import { HotDealsManager, type HotProduct } from "@/components/admin/hot-deals-manager";
import { NewsletterList, type SubscriberRow } from "@/components/admin/newsletter-list";
import { SocialManager, type SocialRow } from "@/components/admin/social-manager";
import { VideoManager, type VideoRow } from "@/components/admin/video-manager";
import { PromotionManager } from "@/components/admin/promotion-manager";
import { ErrorNote, NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { MARKETING_PAGES } from "@/lib/admin/unavailable";
import { bannerImageUrl, MAX_BANNERS, MAX_SHOWN } from "@/lib/banners";
import { getDb } from "@/lib/db";
import { MAX_VIDEOS, VIDEO_PLACEMENT } from "@/lib/videos";
import { faqItems } from "@/components/home/more-sections";
import { getSettings } from "@/lib/erp/settings";
import { PAGES, getInfoPage } from "@/lib/info-pages";
import { readApplication, WHOLESALE_PLACEMENT } from "@/lib/wholesale";
import { MAX_HOT_PRODUCTS, getHotDealsConfig, toPicker } from "@/lib/hot-deals";
import { getErpSnapshot } from "@/lib/erp/catalogue";
import { MAX_SOCIAL, SOCIAL_PLACEMENT } from "@/lib/home-extras";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kind: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = MARKETING_PAGES[(await params).kind];
  return { title: p?.title ?? "Marketing" };
}

export default async function Page({ params }: Props) {
  const { kind } = await params;
  const page = MARKETING_PAGES[kind];
  if (!page) notFound();
  const denied = await adminGate(`/admin/marketing/${kind}`);
  if (denied) return denied;
  if (kind === "promotions") {
    return (
      <>
        <PageHeader title="Promotions" subtitle="Rules are checked on the server. Customers are charged the HEXALYTE price." />
        <PromotionManager />
      </>
    );
  }
  if (kind === "pages") {
    const db = getDb();
    const settings = await getSettings().catch(() => null);
    const pages: EditorPage[] = await Promise.all(
      PAGES.map(async (def) => {
        const { content, custom } = await getInfoPage(def.slug);
        // The FAQ's default questions come from live settings, so the editor starts from the ones shoppers see today.
        const sections =
          def.slug === "faq" && !custom
            ? faqItems({ cod: settings?.paymentMethods.COD === true, deliveryCharge: settings ? settings.deliveryCharge : null }).map((i) => ({ heading: i.q, body: i.a }))
            : content.sections;
        return { slug: def.slug, path: def.path, label: def.label, custom, title: content.title, intro: content.intro, sections };
      }),
    );
    return (
      <>
        <PageHeader title="Info pages" subtitle="The text of About, FAQ, Shipping, Returns, Warranty, Privacy and Terms." />
        {db ? <InfoPagesEditor pages={pages} /> : <ErrorNote>The website database is not available, so pages cannot be edited right now.</ErrorNote>}
      </>
    );
  }
  if (kind === "social") {
    const db = getDb();
    const found = db
      ? await db.banner
          .findMany({ where: { placement: SOCIAL_PLACEMENT }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, headline: true, text: true, href: true, active: true } })
          .catch(() => null)
      : null;
    const rows: SocialRow[] = (found ?? []).map((v) => ({ id: v.id, platform: v.text ?? "", url: v.href, caption: v.headline, active: v.active }));
    return (
      <>
        <PageHeader title="Social posts" subtitle="Instagram and TikTok posts shown on the homepage." />
        {found === null ? <ErrorNote>The website database is not available, so posts cannot be managed right now.</ErrorNote> : <SocialManager rows={rows} max={MAX_SOCIAL} />}
      </>
    );
  }
  if (kind === "wholesale") {
    const db = getDb();
    const found = db
      ? await db.banner.findMany({ where: { placement: WHOLESALE_PLACEMENT }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, headline: true, text: true, href: true, createdAt: true } }).catch(() => null)
      : null;
    const rows: ApplicationRow[] = (found ?? []).flatMap((r) => {
      const a = readApplication(r);
      return a ? [{ id: r.id, receivedAt: r.createdAt.toISOString(), status: a.status, business: a.business, name: a.name, email: a.email, phone: a.phone, type: a.type ?? "", district: a.district ?? "", message: a.message ?? "" }] : [];
    });
    return (
      <>
        <PageHeader title="Wholesale registrations" subtitle="Businesses that registered on the Wholesale page." />
        {found === null ? <ErrorNote>The website database is not available, so registrations cannot be shown right now.</ErrorNote> : <WholesaleManager rows={rows} total={rows.length} />}
      </>
    );
  }
  if (kind === "hot-deals") {
    const db = getDb();
    const { config, saved } = await getHotDealsConfig();
    let selected: HotProduct[] = [];
    try {
      const snap = await getErpSnapshot();
      selected = config.productIds.map((id) => snap.products.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)).map(toPicker);
    } catch {
      /* the ERP is down: the editor still opens, the chosen list just shows empty */
    }
    return (
      <>
        <PageHeader title="Hot Deals" subtitle="The Hot Deals section of the homepage: products, countdown and text." />
        {db ? <HotDealsManager initial={config} selected={selected} saved={saved} max={MAX_HOT_PRODUCTS} /> : <ErrorNote>The website database is not available, so Hot Deals cannot be managed right now.</ErrorNote>}
      </>
    );
  }
  if (kind === "newsletter") {
    const db = getDb();
    let rows: SubscriberRow[] = [];
    let total = 0;
    let failed = !db;
    if (db) {
      try {
        const [list, count] = await Promise.all([
          db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, email: true, createdAt: true } }),
          db.newsletterSubscriber.count(),
        ]);
        rows = list.map((r) => ({ id: r.id, email: r.email, createdAt: r.createdAt.toISOString() }));
        total = count;
      } catch {
        failed = true;
      }
    }
    return (
      <>
        <PageHeader title="Newsletter" subtitle="Email addresses collected from the homepage." />
        {failed ? <ErrorNote>The subscriber list is not available yet. The database may still need the newsletter table (run the latest migration).</ErrorNote> : <NewsletterList rows={rows} total={total} />}
      </>
    );
  }
  if (kind === "videos") {
    const db = getDb();
    const found = db
      ? await db.banner
          .findMany({ where: { placement: VIDEO_PLACEMENT }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, headline: true, text: true, href: true, active: true } })
          .catch(() => null)
      : null;
    const rows: VideoRow[] = (found ?? []).map((v) => ({ id: v.id, videoId: v.href, title: v.headline, channel: v.text ?? "", active: v.active }));
    return (
      <>
        <PageHeader title="Homepage videos" subtitle="YouTube videos shown at the bottom of the homepage." />
        {found === null ? <ErrorNote>The website database is not available, so videos cannot be managed right now.</ErrorNote> : <VideoManager rows={rows} max={MAX_VIDEOS} />}
      </>
    );
  }
  if (kind === "banners") {
    const db = getDb();
    const found = db
      ? await db.banner
          .findMany({
            where: { placement: { in: ["CARDS", "WIDE", "SIDE"] } },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, placement: true, eyebrow: true, headline: true, text: true, ctaLabel: true, href: true, active: true, sortOrder: true, imageType: true, updatedAt: true },
          })
          .catch(() => null)
      : null;
    const rows: BannerRow[] = (found ?? []).map((b) => ({
      id: b.id, placement: b.placement === "WIDE" ? "WIDE" : b.placement === "SIDE" ? "SIDE" : "CARDS", eyebrow: b.eyebrow ?? "", headline: b.headline, text: b.text ?? "", ctaLabel: b.ctaLabel, href: b.href, active: b.active, sortOrder: b.sortOrder,
      imageUrl: b.imageType ? bannerImageUrl(b.id, b.updatedAt) : null,
    }));
    return (
      <>
        <PageHeader title="Promotional banners" subtitle="The picture-and-button cards shown on the homepage." />
        {found === null ? <ErrorNote>The website database is not available, so banners cannot be managed right now.</ErrorNote> : <BannerManager rows={rows} max={MAX_BANNERS} shown={MAX_SHOWN} />}
      </>
    );
  }
  return (
    <>
      <PageHeader title={page.title} />
      <NotAvailable title="Not available yet" why={page.why} needs={page.needs}>
        {page.link && <Link href={page.link.href} className="btn-primary mt-5">{page.link.label}</Link>}
      </NotAvailable>
    </>
  );
}
