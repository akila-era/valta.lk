import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BannerManager, type BannerRow } from "@/components/admin/banner-manager";
import { HotDealManager } from "@/components/admin/hot-deal-manager";
import { PromotionManager } from "@/components/admin/promotion-manager";
import { ErrorNote, NotAvailable, PageHeader } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/gate";
import { MARKETING_PAGES } from "@/lib/admin/unavailable";
import { bannerImageUrl, MAX_BANNERS, MAX_SHOWN } from "@/lib/banners";
import { getDb } from "@/lib/db";

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
  if (kind === "hot-deals") {
    return (
      <>
        <PageHeader title="Hot Deals" subtitle="Choose the products in the homepage Hot Deals panel. Prices and stock always come from the ERP." />
        {getDb() ? <HotDealManager /> : <ErrorNote>The website database is not available, so Hot Deals cannot be managed right now.</ErrorNote>}
      </>
    );
  }
  if (kind === "banners") {
    const db = getDb();
    const found = db
      ? await db.banner
          .findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, placement: true, eyebrow: true, headline: true, text: true, ctaLabel: true, href: true, active: true, sortOrder: true, imageType: true, updatedAt: true },
          })
          .catch(() => null)
      : null;
    const rows: BannerRow[] = (found ?? []).map((b) => ({
      id: b.id, placement: b.placement === "WIDE" ? "WIDE" : "CARDS", eyebrow: b.eyebrow ?? "", headline: b.headline, text: b.text ?? "", ctaLabel: b.ctaLabel, href: b.href, active: b.active, sortOrder: b.sortOrder,
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
