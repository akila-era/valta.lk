import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, LayoutGrid, MessageCircle, ShieldCheck } from "lucide-react";
import { CompareButton } from "@/components/products/compare-button";
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

/** One part of the product details (as on ugreen.lk): a plain heading and its content, divided by a hairline. */
const Section = ({ id, title, children, wide = false }: { id: string; title: string; children: React.ReactNode; wide?: boolean }) => (
  <section aria-labelledby={id} className={`min-w-0 scroll-mt-40 border-b border-border py-8 sm:py-10 ${wide ? "xl:col-span-2" : ""}`}>
    <h2 id={id} className="text-lg font-bold text-ink sm:text-xl">{title}</h2>
    <div className="mt-4 sm:mt-5">{children}</div>
  </section>
);

/** One row of the specifications table: the name in the shaded left column, the value beside it. */
const SpecRow = ({ name, value }: { name: string; value: string }) => (
  <tr className="border-b border-border last:border-b-0">
    <th scope="row" className="w-[40%] bg-surface px-3 py-3 text-left align-top font-semibold text-ink sm:w-[32%] sm:px-4">{name}</th>
    <td className="break-words px-3 py-3 text-ink/85 sm:px-4">{value}</td>
  </tr>
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
  // The warranty in a few words: from the product's content, else the ERP ("12 months").
  const warrantyText = [c?.warranty.duration, c?.warranty.provider].filter(Boolean).join(" · ") || product.specs.Warranty || null;
  // In-page links, only to the sections this product really has.
  const jumps = [
    ...(descHtml || product.description ? [{ id: "desc", label: "Description" }] : []),
    ...(siteSpecGroups.length > 0 || erpSpecs.length > 0 ? [{ id: "specs", label: "Specifications" }] : []),
    ...(hasWarranty || product.specs.Warranty ? [{ id: "warranty", label: "Warranty" }] : []),
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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[auto_minmax(0,1fr)] xl:gap-14">
        <Gallery images={product.images} alt={title} alts={c?.gallery.length ? c.gallery.map((g) => g.alt) : undefined} captions={c?.gallery.length ? c.gallery.map((g) => g.caption) : undefined} />
        <div>
          <h1 className="text-[clamp(1.4rem,1.15rem+0.9vw,1.9rem)] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {rev.summary ? (
            <a href="#reviews" className="mr-4 mt-2 inline-flex items-center gap-2 text-sm hover:underline">
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
          {warrantyText ? (
            // As on ugreen.lk: the warranty as a badge before the price.
            <p className="mt-5 inline-flex items-center gap-2 rounded-control border-2 border-ink px-3 py-1.5 text-sm font-extrabold uppercase tracking-[0.04em] text-ink">
              <ShieldCheck className="h-5 w-5" aria-hidden /> {warrantyText} warranty
            </p>
          ) : null}
          <div className="mt-6">
            <PurchasePanel
              offerNames={offerNames}
              deliveryCharge={settings?.deliveryCharge}
              cod={settings?.paymentMethods.COD === true}
              warranty={warrantyText}
              payments={store.payments.map((k) => PAYMENT_BADGES[k])}
              pickup={{
                estimate: (hasDelivery && c?.delivery.estimate) || store.deliveryTime || undefined,
                pickup: (hasDelivery && c?.delivery.pickup) || store.pickupInfo || undefined,
                notes: (hasDelivery && c?.delivery.notes) || undefined,
              }}
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
            {store.whatsapp ? (
              <a
                href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I would like more information about ${title}: ${siteConfig.url}/products/${product.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#25d366] px-4 text-sm font-bold text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> For more info<span className="sr-only"> on WhatsApp (opens in a new tab)</span>
              </a>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <CompareButton item={{ productId: product.id, slug: product.slug, name: title }} />
              <ShareButtons url={`${siteConfig.url}/products/${product.slug}`} title={title} />
            </div>
          </div>
        </div>
      </div>

      <AccessoryRail productIds={[product.id]} initial={accessories} intro="Only accessories linked to this product. Prices are the catalogue prices. You can continue without them." />

      {/* The details as on ugreen.lk: a centred row of section links, then each part in turn on the page (nothing is
          hidden behind a tab, so every detail is there when scrolling or searching the page). */}
      {jumps.length > 1 && (
        <nav aria-label="On this page" className="mt-12 max-w-full overflow-x-auto border-y border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex w-max gap-6 px-1 sm:gap-10">
            {jumps.map((j) => (
              <li key={j.id}>
                <a href={`#${j.id}`} className="inline-flex min-h-13 items-center border-b-2 border-transparent text-sm font-bold uppercase tracking-[0.04em] text-muted transition-colors hover:border-brand-500 hover:text-ink">
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Description beside the specifications on wide screens when the product has both; otherwise one full-width column. */}
      <div className={`grid gap-x-14 ${(descHtml || product.description) && (siteSpecGroups.length > 0 || erpSpecs.length > 0) ? "xl:grid-cols-2" : ""}`}>
        {(descHtml || product.description) && (
          <Section id="desc" title="Description">
            {descHtml ? <div className="rich max-w-none" dangerouslySetInnerHTML={{ __html: descHtml }} /> : <p className="whitespace-pre-line text-[15px] leading-7 text-ink/85">{product.description}</p>}
          </Section>
        )}
        {(siteSpecGroups.length > 0 || erpSpecs.length > 0) && (
          <Section id="specs" title="Specifications">
            <div className="overflow-hidden rounded-control border border-border">
              <table className="w-full table-fixed text-sm">
                {erpSpecs.length > 0 && (
                  <tbody>
                    {erpSpecs.map(([k, v]) => <SpecRow key={k} name={k} value={v} />)}
                  </tbody>
                )}
                {siteSpecGroups.map((g, gi) => (
                  <tbody key={g.group} className={gi > 0 || erpSpecs.length > 0 ? "border-t border-border" : undefined}>
                    {siteSpecGroups.length > 1 || g.group !== "General" ? (
                      <tr className="border-b border-border">
                        <th colSpan={2} scope="colgroup" className="px-3 py-2.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-ink sm:px-4">{g.group}</th>
                      </tr>
                    ) : null}
                    {g.rows.map((s, i) => <SpecRow key={i} name={s.name} value={`${s.value}${s.unit ? ` ${s.unit}` : ""}`} />)}
                  </tbody>
                ))}
              </table>
            </div>
          </Section>
        )}
        {!hasWarranty && product.specs.Warranty && (
          <Section id="warranty" title="Warranty" wide>
            <p className="flex items-center gap-2 text-[15px] text-ink"><ShieldCheck className="h-5 w-5 shrink-0" aria-hidden /><span className="font-semibold">{product.specs.Warranty}</span> warranty</p>
          </Section>
        )}
        {hasWarranty && c && (
          <Section id="warranty" title="Warranty" wide>
            <div className="text-[15px] leading-7">
              {c.warranty.duration && <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />{c.warranty.duration}{c.warranty.provider ? ` · ${c.warranty.provider}` : ""}</p>}
              {!c.warranty.duration && c.warranty.provider && <p className="font-semibold text-ink">{c.warranty.provider}</p>}
              {c.warranty.description && <p className="mt-1 text-ink/85">{c.warranty.description}</p>}
              {c.warranty.terms && <details className="mt-3"><summary className="cursor-pointer font-semibold text-ink">Warranty terms</summary><p className="mt-2 whitespace-pre-line text-ink/85">{c.warranty.terms}</p></details>}
              {c.warranty.notes && <p className="mt-3 text-sm text-muted">{c.warranty.notes}</p>}
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
