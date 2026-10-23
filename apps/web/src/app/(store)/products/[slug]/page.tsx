import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Battery, Camera, Check, Cpu, Headphones, ShieldCheck, Smartphone, Store, Truck, Wifi, Zap, type LucideIcon } from "lucide-react";
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
  <section aria-labelledby={id}>
    <h2 id={id} className="text-lg font-semibold">{title}</h2>
    <div className="mt-3">{children}</div>
  </section>
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
      <Breadcrumbs
        items={[
          { href: "/", label: "Home" },
          { href: "/products", label: "All products" },
          ...(product.category ? [{ href: `/categories/${product.category.slug}`, label: product.category.name }] : []),
          ...(product.category && product.subCategory ? [{ href: `/categories/${product.category.slug}?sub=${product.subCategory.slug}`, label: product.subCategory.name }] : []),
          { label: title },
        ]}
      />

      <VariantChoice initial={initialVariant}>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Gallery images={product.images} alt={title} alts={c?.gallery.length ? c.gallery.map((g) => g.alt) : undefined} captions={c?.gallery.length ? c.gallery.map((g) => g.caption) : undefined} />
        <div>
          {product.brand && <p className="text-sm font-medium uppercase tracking-wide text-muted">{product.brand}</p>}
          <h1 className="page-title mt-1">{title}</h1>
          {showModel && <p className="mt-1 text-sm text-muted">Model {model}</p>}
          {c?.subtitle && <p className="mt-1 text-base text-muted">{c.subtitle}</p>}
          {badges.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Highlights">
              {badges.map((b) => <li key={b} className="badge bg-brand-50 text-brand-700">{b}</li>)}
            </ul>
          )}
          {c?.shortDescription && <p className="mt-4 max-w-prose text-sm leading-6 text-muted">{c.shortDescription}</p>}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
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
              <h2 className="text-base font-semibold">Key features</h2>
              <ul className="mt-3 space-y-3">
                {c.features.map((f, i) => {
                  const Icon = FEATURE_ICON[f.icon] ?? Check;
                  return (
                  <li key={i} className="flex gap-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span><span className="font-semibold">{f.title}</span>{f.description && <span className="block text-muted">{f.description}</span>}</span>
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
        <nav aria-label="On this page" className="mt-12 max-w-full overflow-x-auto border-b border-border">
          <ul className="flex w-max gap-6">
            {jumps.map((j) => (
              <li key={j.id}>
                <a href={`#${j.id}`} className="inline-flex min-h-12 items-center border-b-2 border-transparent text-sm font-semibold text-muted transition-colors hover:border-brand-500 hover:text-ink">
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className={`${jumps.length > 1 ? "mt-8" : "mt-12"} space-y-12`}>
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
                  {siteSpecGroups.length > 1 || g.group !== "General" ? <h3 className="mb-2 text-sm font-semibold text-muted">{g.group}</h3> : null}
                  <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-2">
                    {g.rows.map((s, i) => (
                      <div key={i} className="min-w-0 bg-bg px-4 py-3 sm:last:odd:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name}</dt>
                        <dd className="mt-1 break-words font-medium text-ink">{s.value}{s.unit ? ` ${s.unit}` : ""}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {erpSpecs.length > 0 && (
                <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-2">
                  {erpSpecs.map(([k, v]) => (
                    <div key={k} className="min-w-0 bg-bg px-4 py-3 sm:last:odd:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
                      <dd className="mt-1 break-words font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </Section>
        )}
        {!hasWarranty && product.specs.Warranty && (
          <Section id="warranty" title="Warranty">
            <p className="rounded-xl border border-border p-4 text-sm">{product.specs.Warranty}</p>
          </Section>
        )}
        {hasWarranty && c && (
          <Section id="warranty" title="Warranty">
            <div className="rounded-xl border border-border p-4 text-sm">
              {c.warranty.duration && <p className="font-semibold">{c.warranty.duration}{c.warranty.provider ? ` · ${c.warranty.provider}` : ""}</p>}
              {!c.warranty.duration && c.warranty.provider && <p className="font-semibold">{c.warranty.provider}</p>}
              {c.warranty.description && <p className="mt-1 text-muted">{c.warranty.description}</p>}
              {c.warranty.terms && <details className="mt-3"><summary className="cursor-pointer font-medium">Warranty terms</summary><p className="mt-2 whitespace-pre-line text-muted">{c.warranty.terms}</p></details>}
              {c.warranty.notes && <p className="mt-3 text-xs text-muted">{c.warranty.notes}</p>}
            </div>
          </Section>
        )}
        {hasDelivery && c && (
          <Section id="delivery" title="Delivery & pickup">
            <ul className="space-y-3 rounded-xl border border-border p-4 text-sm">
              <li className="flex gap-3"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><span><span className="font-semibold">Delivery{settings ? ` · ${formatLkr(settings.deliveryCharge)}` : ""}</span>{c.delivery.estimate && <span className="block text-muted">{c.delivery.estimate}</span>}{c.delivery.notes && <span className="block text-muted">{c.delivery.notes}</span>}</span></li>
              {c.delivery.pickup && <li className="flex gap-3"><Store className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><span><span className="font-semibold">Store pickup</span><span className="block whitespace-pre-line text-muted">{c.delivery.pickup}</span></span></li>}
            </ul>
          </Section>
        )}
      </div>

      </VariantChoice>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-14">
          <SectionHeader id="related" title="Related products">{chosen.length ? "Chosen for this product." : product.category ? `Other products in ${product.category.name}.` : undefined}</SectionHeader>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
