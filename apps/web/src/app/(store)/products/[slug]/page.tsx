import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, LayoutGrid, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { ErpUnavailable } from "@/components/ui/states";
import { AccessoryRail } from "@/components/products/accessory-rail";
import { ProductReviews } from "@/components/products/product-reviews";
import { Stars } from "@/components/products/stars";
import { productReviews } from "@/lib/reviews";
import { Gallery } from "@/components/products/gallery";
import { ProductGrid } from "@/components/products/product-grid";
import { RecentlyViewed, RecordView } from "@/components/products/recently-viewed";
import { ShareButtons } from "@/components/products/share-buttons";
import { PurchasePanel } from "@/components/products/purchase-panel";
import { VariantChoice } from "@/components/products/variant-choice";
import { requireAdmin } from "@/lib/admin/auth";
import { getRecord } from "@/lib/admin/product-content";
import { BADGE_LABELS, groupSpecs, type ContentDoc } from "@/lib/content/schema";
import { htmlToText, sanitizeHtml } from "@/lib/content/sanitize";
import { getDb } from "@/lib/db";
import { getErpSnapshot, getNeighbours, getProductBySlug, getRelated } from "@/lib/erp/catalogue";
import { applyContent, mediaUrl } from "@/lib/erp/content-overlay";
import { offersForSources } from "@/lib/accessories/load";
import { effectivePrice, productOffer } from "@/lib/erp/product-utils";
import { quotePricedLines } from "@/lib/promotions/quote";
import type { PricedLine } from "@/lib/promotions/evaluate";
import { getSettings } from "@/lib/erp/settings";
import { PAYMENT_BADGES, getStoreInfo } from "@/lib/store-info";
import type { ErpProduct } from "@/lib/erp/types";
import { siteConfig } from "@/lib/site-config";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

/**
 * The product to show. Normally the ERP product with PUBLISHED website content. With ?preview=1 and a signed-in admin
 * it is the same page built from the saved DRAFT (never visible to anyone else).
 */
async function load(slug: string, preview: boolean): Promise<{ product: ErpProduct | null; failed: boolean; previewing: boolean }> {
  try {
    if (preview && (await requireAdmin()).kind === "ok") {
      const raw = [...(await getErpSnapshot()).products.values()].find((p) => p.slug === slug) ?? null;
      const db = getDb();
      const rec = raw && db ? await getRecord(db, raw.id) : null;
      if (raw) return { product: rec ? applyContent(raw, rec.draft) : raw, failed: false, previewing: true };
    }
    return { product: await getProductBySlug(slug), failed: false, previewing: false };
  } catch {
    return { product: null, failed: true, previewing: false };
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { product, failed, previewing } = await load(slug, (await searchParams).preview === "1");
  if (failed) return { title: "Product unavailable", robots: { index: false } };
  // notFound() belongs in the page render. Calling it from metadata makes Next respond 200 for a missing product.
  if (!product) return { title: "Page not found", robots: { index: false } };
  const c = product.content;
  const title = c?.seo.title || c?.displayTitle || product.name;
  const description = (c?.seo.description || c?.shortDescription || product.description || `${product.name} at VOLTA.LK`).slice(0, 160);
  const image = c?.seo.ogImageId ? mediaUrl(c.seo.ogImageId) : product.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    robots: previewing || c?.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: `/products/${slug}`, images: image ? [image] : undefined },
  };
}

/** A detail card: a bold heading on a plain bordered panel. */
const Section = ({ id, title, children, className = "" }: { id: string; title: string; children: React.ReactNode; className?: string }) => (
  <section aria-labelledby={id} className={`relative min-w-0 scroll-mt-40 overflow-hidden rounded-card bg-bg p-5 sm:p-7 ${className}`}>
    <h2 id={id} className="relative text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
    <div className="relative mt-5">{children}</div>
  </section>
);

/** One label/value row of a specification list: label on the left, value on the right, on a hairline divider. */
const SpecRow = ({ name, value }: { name: string; value: string }) => (
  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3 text-xs sm:text-sm">
    <dt className="text-muted">{name}</dt>
    <dd className="break-words font-medium text-ink">{value}</dd>
  </div>
);

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { product, failed, previewing } = await load(slug, (await searchParams).preview === "1");
  if (failed) return <ErpUnavailable retryHref={`/products/${slug}`} />;
  if (!product) notFound();

  const c: ContentDoc | undefined = product.content;
  const title = c?.displayTitle || product.name;
  const model = product.specs.Model;
  const showModel = Boolean(model && model.toLowerCase() !== title.toLowerCase());
  const initialVariant = product.variants.length > 1 ? "" : (product.variants[0]?.key ?? "");

  // Related: the products staff chose (only ones that really exist), otherwise same-category products.
  const chosen = c?.related.length ? (await getErpSnapshot().then((s) => c.related.map((id) => s.products.get(id)).filter((p): p is ErpProduct => Boolean(p)))).slice(0, 8) : [];
  const related = chosen.length ? chosen : await getRelated(product).catch(() => []);
  const { prev, next } = await getNeighbours(product).catch(() => ({ prev: null, next: null }));

  const descHtml = c?.descriptionHtml ? sanitizeHtml(c.descriptionHtml) : "";
  const siteSpecGroups = c ? groupSpecs(c.specs) : [];
  const erpSpecs = Object.entries(product.specs).filter(([key]) => key !== "Warranty");
  const hasWarranty = Boolean(c && (c.warranty.duration || c.warranty.description || c.warranty.terms || c.warranty.provider || c.warranty.notes));
  const hasDelivery = Boolean(c && (c.delivery.estimate || c.delivery.pickup || c.delivery.notes));
  const badges = [...(c?.badges.map((b) => BADGE_LABELS[b]) ?? []), ...(c?.promoLabel ? [c.promoLabel] : [])];
  const priced: PricedLine[] = product.hasVariants
    ? product.variants.map((v) => ({ productId: product.id, variantKey: v.key, quantity: 1, listPrice: v.price, erpPrice: effectivePrice(v), categoryName: product.category?.name ?? null }))
    : [{ productId: product.id, variantKey: "", quantity: 1, listPrice: product.price, erpPrice: effectivePrice(product), categoryName: product.category?.name ?? null }];
  const [quote, accessories, settings, rev] = await Promise.all([quotePricedLines(priced), offersForSources([product.id]), getSettings().catch(() => null), productReviews(product.id)]);
  const store = await getStoreInfo();
  // In-page links, only to the sections this product really has.
  const jumps = [
    ...(descHtml || product.description ? [{ id: "desc", label: "Description" }] : []),
    ...(siteSpecGroups.length > 0 || erpSpecs.length > 0 ? [{ id: "specs", label: "Specifications" }] : []),
    ...(hasWarranty || product.specs.Warranty ? [{ id: "warranty", label: "Warranty" }] : []),
    ...(hasDelivery ? [{ id: "delivery", label: "Delivery & pickup" }] : []),
    { id: "reviews", label: rev.summary ? `Reviews (${rev.summary.count})` : "Reviews" },
  ];
  const offerNames = Object.fromEntries(quote.lines.flatMap((l) => (l.offerName ? [[l.variantKey, l.offerName]] : [])));

  // Structured data only from real fields: ratings only from approved customer reviews, no invented stock.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description: (htmlToText(descHtml) || c?.shortDescription || product.description) || undefined,
    sku: product.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    image: product.images.length ? product.images.map((i) => (i.startsWith("/") ? `${siteConfig.url}${i}` : i)) : undefined,
    url: `${siteConfig.url}/products/${product.slug}`,
    offers: productOffer(product),
    aggregateRating: rev.summary ? { "@type": "AggregateRating", ratingValue: rev.summary.average, reviewCount: rev.summary.count, bestRating: 5, worstRating: 1 } : undefined,
    review: rev.reviews.length
      ? rev.reviews.slice(0, 5).map((r) => ({ "@type": "Review", reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 }, author: { "@type": "Person", name: r.name }, datePublished: r.createdAt.slice(0, 10), reviewBody: r.body }))
      : undefined,
  };

  return (
    <>
      {previewing && (
        <div className="mb-6">
          <Notice tone="warning" title="Preview of unpublished changes.">
            <p>Only you can see this. Customers see the published version. <Link href={`/admin/products/${product.id}`} className="font-semibold underline">Back to the editor</Link></p>
          </Notice>
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Breadcrumbs */}
      <div className="mb-6 flex items-start justify-between gap-4">
      <nav aria-label="Breadcrumb" className="w-fit min-w-0">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <li>
            <Link href="/" className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden className="text-muted/70">/</li>
          <li>
            <Link href="/products" className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
              All products
            </Link>
          </li>
          {product.category && (
            <>
              <li aria-hidden className="text-muted/70">/</li>
              <li>
                <Link href={`/categories/${product.category.slug}`} className="inline-flex min-h-6 items-center transition-colors hover:text-ink">
                  {product.category.name}
                </Link>
              </li>
            </>
          )}
          {product.category && product.subCategory && (
            <>
              <li aria-hidden className="text-muted/70">/</li>
              <li>
                <Link
                  href={`/categories/${product.category.slug}?sub=${product.subCategory.slug}`}
                  className="inline-flex min-h-6 items-center transition-colors hover:text-ink"
                >
                  {product.subCategory.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden className="text-muted/70">/</li>
          <li>
            <span className="inline-block max-w-[24ch] truncate align-bottom font-semibold text-ink sm:max-w-[60ch]" aria-current="page">
              {title}
            </span>
          </li>
        </ol>
      </nav>
      {/* ‹ › the previous and next product in this category (A to Z), with the category itself between them. */}
      {product.category && (prev || next) ? (
        <nav aria-label="More in this category" className="flex shrink-0 items-center gap-1">
          {[
            { p: prev, label: "Previous product", Icon: ChevronLeft },
            { p: null, label: `All ${product.category.name}`, Icon: LayoutGrid, href: `/categories/${product.category.slug}` },
            { p: next, label: "Next product", Icon: ChevronRight },
          ].map(({ p, label, Icon, href }) => {
            const to = href ?? (p ? `/products/${p.slug}` : null);
            const name = p ? `${label}: ${p.content?.displayTitle || p.name}` : label;
            const cls = "flex h-9 w-8 items-center justify-center text-ink transition-colors";
            return to ? (
              <Link key={label} href={to} aria-label={name} title={name} className={`${cls} hover:text-brand-600`}>
                <Icon className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <span key={label} aria-hidden className={`${cls} opacity-35`}>
                <Icon className="h-4 w-4" />
              </span>
            );
          })}
        </nav>
      ) : null}
      </div>

      <VariantChoice initial={initialVariant}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <Gallery images={product.images} alt={title} alts={c?.gallery.length ? c.gallery.map((g) => g.alt) : undefined} captions={c?.gallery.length ? c.gallery.map((g) => g.caption) : undefined} />
        <div>
          <h1 className="text-[clamp(1.4rem,1.15rem+0.9vw,1.9rem)] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {rev.summary ? (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm hover:underline">
              <Stars rating={rev.summary.average} label={`Rated ${rev.summary.average} out of 5`} />
              <span className="font-semibold text-ink">{rev.summary.average.toFixed(1)}</span>
              <span className="text-muted">({rev.summary.count} {rev.summary.count === 1 ? "review" : "reviews"})</span>
            </a>
          ) : null}
          {c?.subtitle && <p className="mt-2 text-base text-muted">{c.subtitle}</p>}
          {/* "✓ In stock" under the title, as on ugreen.lk. */}
          <p className={`mt-2 inline-flex items-center gap-1.5 text-lg font-bold ${product.available ? "text-brand-500" : "text-muted"}`}>
            {product.available ? <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden /> : null}
            {product.available ? "In stock" : "Sold out"}
          </p>
          <div className="mt-4 border-t border-border pt-4">
            {/* The key points as one bullet list ("Model : …", then "Title: description"), as on ugreen.lk. */}
            {showModel || (c && c.features.length > 0) ? (
              <ul aria-label="Key points" className="list-disc space-y-1.5 pl-5 text-[15px] leading-6 text-ink/85 marker:text-ink">
                {showModel ? (
                  <li>
                    <span className="font-semibold text-ink">Model :</span> {model}
                  </li>
                ) : null}
                {c?.features.map((f, i) => (
                  <li key={i}>
                    <span className="font-semibold text-ink">{f.title}{f.description ? ":" : ""}</span>
                    {f.description ? ` ${f.description}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {c?.shortDescription && <p className="mt-3 max-w-prose text-[15px] leading-7 text-muted">{c.shortDescription}</p>}
            {badges.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Highlights">
                {badges.map((b) => <li key={b} className="rounded-control bg-brand-500 px-3 py-1 text-xs font-bold text-on-brand">{b}</li>)}
              </ul>
            )}
          </div>
          <div className="mt-6">
            <PurchasePanel
              offerNames={offerNames}
              deliveryCharge={settings?.deliveryCharge}
              cod={settings?.paymentMethods.COD === true}
              warranty={[c?.warranty.duration, c?.warranty.provider].filter(Boolean).join(" · ") || product.specs.Warranty || null}
              payments={store.payments.map((k) => PAYMENT_BADGES[k])}
              pickup={hasDelivery && c ? { estimate: c.delivery.estimate || undefined, pickup: c.delivery.pickup || undefined, notes: c.delivery.notes || undefined } : undefined}
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name, // the ERP name goes to the cart and the order, never the display title
                sku: product.sku,
                image: product.images[0],
                price: product.price,
                salePrice: product.salePrice,
                available: product.available,
                purchasableQuantity: product.purchasableQuantity,
                variants: product.variants,
              }}
            />
            <div className="mt-5 border-t border-border pt-4">
              <ShareButtons url={`${siteConfig.url}/products/${product.slug}`} title={title} />
            </div>
          </div>
        </div>
      </div>

      <AccessoryRail productIds={[product.id]} initial={accessories} intro="Only accessories linked to this product. Prices are the catalogue prices. You can continue without them." />

      {jumps.length > 1 && (
        <nav aria-label="On this page" className="mt-12 max-w-full overflow-x-auto border-b border-border">
          <ul className="flex w-max gap-4 sm:gap-6">
            {jumps.map((j) => (
              <li key={j.id}>
                <a href={`#${j.id}`} className="inline-flex min-h-11 items-center border-b-2 border-transparent text-[15px] font-semibold uppercase text-muted transition-colors hover:border-brand-500 hover:text-ink">
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Two columns on wide screens (description beside specifications) so the page has no empty right half. */}
      <div className={`${jumps.length > 1 ? "mt-6" : "mt-12"} grid items-start gap-5 rounded-panel bg-surface p-3 sm:p-5 lg:grid-cols-2`}>
        {(descHtml || product.description) && (
          <Section id="desc" title="Description">
            {descHtml ? <div className="rich" dangerouslySetInnerHTML={{ __html: descHtml }} /> : <p className="whitespace-pre-line text-sm leading-6 text-muted">{product.description}</p>}
          </Section>
        )}
        {(siteSpecGroups.length > 0 || erpSpecs.length > 0) && (
          <Section id="specs" title="Specifications">
            <div className="space-y-5">
              {siteSpecGroups.map((g) => (
                <div key={g.group}>
                  {siteSpecGroups.length > 1 || g.group !== "General" ? <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{g.group}</h3> : null}
                  <dl className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 [&>div:nth-child(odd)]:bg-bg">
                    {g.rows.map((s, i) => <SpecRow key={i} name={s.name} value={`${s.value}${s.unit ? ` ${s.unit}` : ""}`} />)}
                  </dl>
                </div>
              ))}
              {erpSpecs.length > 0 && (
                <dl className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 [&>div:nth-child(odd)]:bg-bg">
                  {erpSpecs.map(([k, v]) => <SpecRow key={k} name={k} value={v} />)}
                </dl>
              )}
            </div>
          </Section>
        )}
        {!hasWarranty && product.specs.Warranty && (
          <Section id="warranty" title="Warranty">
            <p className="flex gap-3 rounded-xl border border-border p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden /><span className="font-medium">{product.specs.Warranty}</span></p>
          </Section>
        )}
        {hasWarranty && c && (
          <Section id="warranty" title="Warranty">
            <div className="flex gap-3 rounded-xl border border-border p-4 text-sm">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0">
              {c.warranty.duration && <p className="font-semibold">{c.warranty.duration}{c.warranty.provider ? ` · ${c.warranty.provider}` : ""}</p>}
              {!c.warranty.duration && c.warranty.provider && <p className="font-semibold">{c.warranty.provider}</p>}
              {c.warranty.description && <p className="mt-1 text-muted">{c.warranty.description}</p>}
              {c.warranty.terms && <details className="mt-3"><summary className="cursor-pointer font-medium">Warranty terms</summary><p className="mt-2 whitespace-pre-line text-muted">{c.warranty.terms}</p></details>}
              {c.warranty.notes && <p className="mt-3 text-xs text-muted">{c.warranty.notes}</p>}
              </div>
            </div>
          </Section>
        )}
      </div>

      </VariantChoice>

      <ProductReviews productId={product.id} productName={title} summary={rev.summary} reviews={rev.reviews} />

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-2 sm:mb-8">
            <h2 id="related" className="statement text-title-section">Related products</h2>
            <p className="max-w-sm text-sm leading-6 text-muted">{chosen.length ? "Handpicked additions for this item." : product.category ? `More from ${product.category.name}.` : null}</p>
          </div>
          <ProductGrid products={related} columns={4} />
        </section>
      )}
      <RecordView item={{ productId: product.id, slug: product.slug, name: title, image: product.images[0] }} />
      <RecentlyViewed exclude={product.id} />
    </>
  );
}
