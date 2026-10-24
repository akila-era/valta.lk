import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Battery, Camera, Check, ChevronRight, Cpu, Headphones, ShieldCheck, Smartphone, Store, Truck, Wifi, Zap, type LucideIcon } from "lucide-react";
import { Breadcrumbs, SectionHeader } from "@/components/ui/chrome";
import { Notice } from "@/components/ui/notice";
import { ErpUnavailable } from "@/components/ui/states";
import { AccessoryRail } from "@/components/products/accessory-rail";
import { Gallery } from "@/components/products/gallery";
import { ProductGrid } from "@/components/products/product-card";
import { PurchasePanel } from "@/components/products/purchase-panel";
import { VariantChoice } from "@/components/products/variant-choice";
import { requireAdmin } from "@/lib/admin/auth";
import { getRecord } from "@/lib/admin/product-content";
import { BADGE_LABELS, groupSpecs, type ContentDoc } from "@/lib/content/schema";
import { htmlToText, sanitizeHtml } from "@/lib/content/sanitize";
import { getDb } from "@/lib/db";
import { getErpSnapshot, getProductBySlug, getRelated } from "@/lib/erp/catalogue";
import { applyContent, mediaUrl } from "@/lib/erp/content-overlay";
import { offersForSources } from "@/lib/accessories/load";
import { effectivePrice, productOffer } from "@/lib/erp/product-utils";
import { quotePricedLines } from "@/lib/promotions/quote";
import type { PricedLine } from "@/lib/promotions/evaluate";
import { getSettings } from "@/lib/erp/settings";
import type { ErpProduct } from "@/lib/erp/types";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";

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
  const description = (c?.seo.description || c?.shortDescription || product.description || `${product.name} at VALTA.LK`).slice(0, 160);
  const image = c?.seo.ogImageId ? mediaUrl(c.seo.ogImageId) : product.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    robots: previewing || c?.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: `/products/${slug}`, images: image ? [image] : undefined },
  };
}

const FEATURE_ICON: Record<string, LucideIcon> = { zap: Zap, shield: ShieldCheck, battery: Battery, wifi: Wifi, cpu: Cpu, camera: Camera, smartphone: Smartphone, headphones: Headphones };

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="scroll-mt-40 rounded-3xl border border-border/80 bg-white p-6 shadow-soft sm:p-8">
    <h2 id={id} className="border-l-[3px] border-brand-500 pl-3 font-display text-lg font-bold tracking-[-0.015em] text-ink sm:text-xl">{title}</h2>
    <div className="mt-5">{children}</div>
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

  const descHtml = c?.descriptionHtml ? sanitizeHtml(c.descriptionHtml) : "";
  const siteSpecGroups = c ? groupSpecs(c.specs) : [];
  const erpSpecs = Object.entries(product.specs).filter(([key]) => key !== "Warranty");
  const hasWarranty = Boolean(c && (c.warranty.duration || c.warranty.description || c.warranty.terms || c.warranty.provider || c.warranty.notes));
  const hasDelivery = Boolean(c && (c.delivery.estimate || c.delivery.pickup || c.delivery.notes));
  const badges = [...(c?.badges.map((b) => BADGE_LABELS[b]) ?? []), ...(c?.promoLabel ? [c.promoLabel] : [])];
  const priced: PricedLine[] = product.hasVariants
    ? product.variants.map((v) => ({ productId: product.id, variantKey: v.key, quantity: 1, listPrice: v.price, erpPrice: effectivePrice(v), categoryName: product.category?.name ?? null }))
    : [{ productId: product.id, variantKey: "", quantity: 1, listPrice: product.price, erpPrice: effectivePrice(product), categoryName: product.category?.name ?? null }];
  const [quote, accessories, settings] = await Promise.all([quotePricedLines(priced), offersForSources([product.id]), getSettings().catch(() => null)]);
  // In-page links, only to the sections this product really has.
  const jumps = [
    ...(descHtml || product.description ? [{ id: "desc", label: "Description" }] : []),
    ...(siteSpecGroups.length > 0 || erpSpecs.length > 0 ? [{ id: "specs", label: "Specifications" }] : []),
    ...(hasWarranty || product.specs.Warranty ? [{ id: "warranty", label: "Warranty" }] : []),
    ...(hasDelivery ? [{ id: "delivery", label: "Delivery & pickup" }] : []),
  ];
  const offerNames = Object.fromEntries(quote.lines.flatMap((l) => (l.offerName ? [[l.variantKey, l.offerName]] : [])));

  // Structured data only from real fields: no ratings, review counts or invented stock.
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
      {/* Pill Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 w-fit">
        <ol className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/80 bg-white px-4 py-1.5 text-xs text-muted shadow-soft">
          <li>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <Link href="/products" className="transition-colors hover:text-ink">
              All products
            </Link>
          </li>
          {product.category && (
            <>
              <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
              <li>
                <Link href={`/categories/${product.category.slug}`} className="transition-colors hover:text-ink">
                  {product.category.name}
                </Link>
              </li>
            </>
          )}
          {product.category && product.subCategory && (
            <>
              <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
              <li>
                <Link
                  href={`/categories/${product.category.slug}?sub=${product.subCategory.slug}`}
                  className="transition-colors hover:text-ink"
                >
                  {product.subCategory.name}
                </Link>
              </li>
            </>
          )}
          <ChevronRight className="h-3 w-3 text-muted/60" aria-hidden />
          <li>
            <span className="font-semibold text-brand-600 truncate max-w-[20ch] sm:max-w-[32ch] inline-block align-bottom" aria-current="page">
              {title}
            </span>
          </li>
        </ol>
      </nav>

      <VariantChoice initial={initialVariant}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <Gallery images={product.images} alt={title} alts={c?.gallery.length ? c.gallery.map((g) => g.alt) : undefined} captions={c?.gallery.length ? c.gallery.map((g) => g.caption) : undefined} />
        <div>
          {(product.brand || product.category) && (
            <p className="kicker flex flex-wrap items-center gap-x-2">
              {product.brand && <span className="text-brand-600">{product.brand}</span>}
              {product.brand && product.category && <span aria-hidden className="h-1 w-1 rounded-full bg-border" />}
              {product.category && <Link href={`/categories/${product.category.slug}`} className="hover:text-ink">{product.category.name}</Link>}
            </p>
          )}
          <h1 className="statement mt-3 text-[clamp(2rem,1.5rem+1.8vw,3rem)] leading-[1.04]">{title}</h1>
          {(showModel || c?.subtitle) && (
            <p className="mt-2 text-base text-muted">
              {c?.subtitle}
              {c?.subtitle && showModel ? " · " : ""}
              {showModel ? `Model ${model}` : ""}
            </p>
          )}
          {badges.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Highlights">
              {badges.map((b) => <li key={b} className="badge rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{b}</li>)}
            </ul>
          )}
          {c?.shortDescription && <p className="mt-4 max-w-prose text-[15px] leading-7 text-muted">{c.shortDescription}</p>}
          <div className="relative mt-6 rounded-3xl border border-border/80 bg-white p-6 shadow-soft ring-1 ring-ink/[0.04] sm:p-7">
            <PurchasePanel
              offerNames={offerNames}
              deliveryCharge={settings?.deliveryCharge}
              cod={settings?.paymentMethods.COD === true}
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
          </div>
          {c && c.features.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Key features</h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {c.features.map((f, i) => {
                  const Icon = FEATURE_ICON[f.icon] ?? Check;
                  return (
                  <li key={i} className="flex gap-3 rounded-2xl border border-border/80 bg-warm-white/40 p-3.5 text-sm shadow-soft">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0"><span className="block font-semibold leading-5 text-ink">{f.title}</span>{f.description && <span className="mt-0.5 block text-xs leading-5 text-muted">{f.description}</span>}</span>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <AccessoryRail productIds={[product.id]} initial={accessories} intro="Only accessories linked to this product. Prices are the catalogue prices. You can continue without them." />

      {jumps.length > 1 && (
        <nav aria-label="On this page" className="sticky top-[var(--hdr-sticky,7.5rem)] z-20 mt-10 max-w-full overflow-x-auto rounded-full border border-border/80 bg-white/95 px-4 py-1.5 shadow-soft backdrop-blur">
          <ul className="flex w-max gap-4 sm:gap-6">
            {jumps.map((j) => (
              <li key={j.id}>
                <a href={`#${j.id}`} className="inline-flex min-h-9 items-center text-xs font-bold text-muted transition-colors hover:text-brand-600">
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className={`${jumps.length > 1 ? "mt-8" : "mt-12"} max-w-4xl space-y-12`}>
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
                  <dl className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 [&>div:nth-child(odd)]:bg-warm-white/60">
                    {g.rows.map((s, i) => <SpecRow key={i} name={s.name} value={`${s.value}${s.unit ? ` ${s.unit}` : ""}`} />)}
                  </dl>
                </div>
              ))}
              {erpSpecs.length > 0 && (
                <dl className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 [&>div:nth-child(odd)]:bg-warm-white/60">
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
        {hasDelivery && c && (
          <Section id="delivery" title="Delivery & pickup">
            <ul className="space-y-3 rounded-xl border border-border p-4 text-sm">
              <li className="flex gap-3"><Truck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden /><span><span className="font-semibold">Delivery{settings ? ` · ${formatLkr(settings.deliveryCharge)}` : ""}</span>{c.delivery.estimate && <span className="block text-muted">{c.delivery.estimate}</span>}{c.delivery.notes && <span className="block text-muted">{c.delivery.notes}</span>}</span></li>
              {c.delivery.pickup && <li className="flex gap-3"><Store className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden /><span><span className="font-semibold">Store pickup</span><span className="block whitespace-pre-line text-muted">{c.delivery.pickup}</span></span></li>}
            </ul>
          </Section>
        )}
      </div>

      </VariantChoice>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-16 border-t border-border/80 pt-10">
          <SectionHeader id="related" eyebrow="RECOMMENDED / MORE TO EXPLORE" title="Related products">{chosen.length ? "Handpicked additions for this item." : product.category ? `Other popular items in ${product.category.name}.` : undefined}</SectionHeader>
          <ProductGrid products={related} columns={5} />
        </section>
      )}
    </>
  );
}
