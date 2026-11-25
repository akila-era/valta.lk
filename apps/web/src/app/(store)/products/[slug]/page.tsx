import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Battery, Camera, Check, Cpu, Headphones, ShieldCheck, Smartphone, Store, Truck, Wifi, Zap, type LucideIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/chrome";
import { Accordion } from "@/components/ui/accordion";
import { Notice } from "@/components/ui/notice";
import { ErpUnavailable } from "@/components/ui/states";
import { AccessoryRail } from "@/components/products/accessory-rail";
import { Gallery } from "@/components/products/gallery";
import { ProductRow } from "@/components/home/product-row";
import { ProductMeta, ShareRow, PdpTrust } from "@/components/products/pdp-extras";
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
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { RecentTracker } from "@/components/products/recent-tracker";
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
  const description = (c?.seo.description || c?.shortDescription || product.description || `${product.name} at VOLTA.LK`).slice(0, 160);
  const image = c?.seo.ogImageId ? mediaUrl(c.seo.ogImageId) : product.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    robots: previewing || c?.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: `/products/${product.slug}`, images: image ? [image] : undefined },
  };
}

const FEATURE_ICON: Record<string, LucideIcon> = { zap: Zap, shield: ShieldCheck, battery: Battery, wifi: Wifi, cpu: Cpu, camera: Camera, smartphone: Smartphone, headphones: Headphones };

const Section = ({ id, title, children, open = false }: { id: string; title: string; children: React.ReactNode; open?: boolean }) => (
  <Accordion id={id} title={title} defaultOpen={open}>{children}</Accordion>
);

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { product, failed, previewing } = await load(slug, (await searchParams).preview === "1");
  if (failed) return <ErpUnavailable retryHref={`/products/${slug}`} />;
  if (!product) notFound();
  // An old link ("name-<id>") goes to the clean address.
  if (!previewing && product.slug !== slug) permanentRedirect(`/products/${product.slug}`);

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
  const badges = [...(c?.badges.map((b) => BADGE_LABELS[b]) ?? []), ...(c?.promoLabel ? [c.promoLabel] : [])];
  const priced: PricedLine[] = product.hasVariants
    ? product.variants.map((v) => ({ productId: product.id, variantKey: v.key, quantity: 1, listPrice: v.price, erpPrice: effectivePrice(v), categoryName: product.category?.name ?? null }))
    : [{ productId: product.id, variantKey: "", quantity: 1, listPrice: product.price, erpPrice: effectivePrice(product), categoryName: product.category?.name ?? null }];
  const [quote, accessories, settings] = await Promise.all([quotePricedLines(priced), offersForSources([product.id]), getSettings().catch(() => null)]);
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
      {!previewing && <RecentTracker productId={product.id} />}
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
          {product.brand && <p className="text-[13px] uppercase tracking-[0.04em] text-muted">{product.brand}</p>}
          <h1 className="mt-2 text-[1.625rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2rem]">{title}</h1>
          {showModel && <p className="mt-1 text-sm text-muted">Model {model}</p>}
          {c?.subtitle && <p className="mt-1 text-base text-muted">{c.subtitle}</p>}
          {badges.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Highlights">
              {badges.map((b) => <li key={b} className="badge bg-brand-50 text-brand-700">{b}</li>)}
            </ul>
          )}
          {c?.shortDescription && <p className="mt-4 max-w-prose text-sm leading-6 text-muted">{c.shortDescription}</p>}
          <div className="mt-6 border-t border-border pt-6">
            <PurchasePanel
              offerNames={offerNames}
              deliveryCharge={settings?.deliveryCharge}
              cod={settings?.paymentMethods.COD === true}
              deliveryTime={c?.delivery.estimate || siteConfig.deliveryTime}
              warranty={c?.warranty.duration || product.specs.Warranty || siteConfig.warranty || undefined}
              whatsapp={siteConfig.whatsapp.replace(/\D/g, "") || undefined}
              installments={siteConfig.installments}
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
          <ProductMeta sku={product.sku} brand={product.brand} category={product.category} sub={product.subCategory} />
          <ShareRow url={`${siteConfig.url}/products/${product.slug}`} title={title} />
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

      <div className="mt-10 border-t border-border">
        {(descHtml || product.description) && (
          <Section id="desc" title="Description" open>
            {descHtml ? <div className="rich" dangerouslySetInnerHTML={{ __html: descHtml }} /> : <p className="whitespace-pre-line text-sm leading-6 text-muted">{product.description}</p>}
          </Section>
        )}
        {(siteSpecGroups.length > 0 || erpSpecs.length > 0) && (
          <Section id="specs" title="Specifications">
            <div className="space-y-5">
              {siteSpecGroups.map((g) => (
                <div key={g.group}>
                  {siteSpecGroups.length > 1 || g.group !== "General" ? <h3 className="mb-2 text-[13px] font-semibold text-muted">{g.group}</h3> : null}
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {g.rows.map((sp, i) => (
                        <tr key={i} className="border-b border-border last:border-0 odd:bg-surface">
                          <th scope="row" className="w-2/5 px-3 py-2 text-left font-normal text-muted">{sp.name}</th>
                          <td className="px-3 py-2 font-medium text-ink">{sp.value}{sp.unit ? ` ${sp.unit}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {erpSpecs.length > 0 && (
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {erpSpecs.map(([k, v]) => (
                      <tr key={k} className="border-b border-border last:border-0 odd:bg-surface">
                        <th scope="row" className="w-2/5 px-3 py-2 text-left font-normal text-muted">{k}</th>
                        <td className="px-3 py-2 font-medium text-ink">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>
        )}
        {!hasWarranty && product.specs.Warranty && (
          <Section id="warranty" title="Warranty">
            <p className="rounded-2xl border border-border p-4 text-sm">{product.specs.Warranty}</p>
          </Section>
        )}
        {hasWarranty && c && (
          <Section id="warranty" title="Warranty">
            <div className="rounded-2xl border border-border p-4 text-sm">
              {c.warranty.duration && <p className="font-semibold">{c.warranty.duration}{c.warranty.provider ? ` · ${c.warranty.provider}` : ""}</p>}
              {!c.warranty.duration && c.warranty.provider && <p className="font-semibold">{c.warranty.provider}</p>}
              {c.warranty.description && <p className="mt-1 text-muted">{c.warranty.description}</p>}
              {c.warranty.terms && <details className="mt-3"><summary className="cursor-pointer font-medium">Warranty terms</summary><p className="mt-2 whitespace-pre-line text-muted">{c.warranty.terms}</p></details>}
              {c.warranty.notes && <p className="mt-3 text-xs text-muted">{c.warranty.notes}</p>}
            </div>
          </Section>
        )}
        <Section id="delivery" title="Delivery & returns">
          <ul className="space-y-3">
            <li className="flex gap-3"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><span><span className="font-semibold">Delivery{settings ? ` · ${formatLkr(settings.deliveryCharge)}` : ""}</span><span className="block text-muted">{c?.delivery.estimate || siteConfig.deliveryTime}</span>{c?.delivery.notes && <span className="block text-muted">{c.delivery.notes}</span>}</span></li>
            {c?.delivery.pickup && <li className="flex gap-3"><Store className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /><span><span className="font-semibold">Store pickup</span><span className="block whitespace-pre-line text-muted">{c.delivery.pickup}</span></span></li>}
            <li className="text-muted">Read the <Link href="/returns-policy" className="font-medium text-ink underline underline-offset-2">returns policy</Link> and <Link href="/shipping-policy" className="font-medium text-ink underline underline-offset-2">shipping policy</Link>.</li>
          </ul>
        </Section>
      </div>

      </VariantChoice>

      <PdpTrust cod={settings?.paymentMethods.COD === true} />

      <ProductRow id="related" title="Related products" href={product.category ? `/categories/${product.category.slug}` : "/products"} products={related} bare />

      <RecentlyViewed exclude={product.id} />
    </>
  );
}
