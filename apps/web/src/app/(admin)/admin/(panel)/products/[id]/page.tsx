import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorNote, PageHeader } from "@/components/admin/ui";
import { AccessoryManager } from "@/components/admin/accessory-manager";
import { ProductEditor } from "@/components/admin/product-editor";
import { adminDb, adminGate } from "@/lib/admin/gate";
import { getRecord, productIdSchemaRe } from "@/lib/admin/product-content";
import { catalogue, erpHealth, isLow, isOut } from "@/lib/admin/stats";
import { emptyDoc } from "@/lib/content/schema";
import { getErpSnapshot } from "@/lib/erp/catalogue";
import { effectivePrice } from "@/lib/erp/product-utils";
import { formatLkr } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" });

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!productIdSchemaRe.test(id)) notFound();
  const denied = await adminGate(`/admin/products/${id}`);
  if (denied) return denied;
  const { db, notice } = adminDb();
  if (!db) return notice;
  const cat = await catalogue();
  if (!cat) return (<><PageHeader title="Edit product" /><ErrorNote>The ERP catalogue could not be loaded, so the product cannot be edited right now.</ErrorNote></>);
  const p = cat.products.find((x) => x.id === id);
  if (!p) notFound();
  const raw = (await getErpSnapshot()).products.get(id) ?? p; // the ERP's own product, without website content
  const [rec, health] = await Promise.all([getRecord(db, id), erpHealth()]);
  const doc = rec?.draft ?? emptyDoc();
  const related = doc.related.map((rid) => cat.products.find((x) => x.id === rid)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => ({ id: x.id, name: x.name, sku: x.sku ?? null }));
  const qty = Math.max(0, p.purchasableQuantity);

  return (
    <>
      <Link href="/admin/products" className="sr-only focus:not-sr-only focus:mb-3 focus:inline-block">Back to products</Link>
      <ProductEditor
        productId={id}
        slug={p.slug}
        erpName={raw.name}
        erpImage={raw.images[0]}
        initialDoc={doc}
        initialVersion={rec?.version ?? 0}
        initialPublished={rec?.published ?? null}
        publishedAt={rec?.publishedAt?.toISOString() ?? null}
        related={related}
        sku={p.sku ?? "-"}
        lastSaved={rec ? `${when(rec.updatedAt)}${rec.updatedBy ? ` by ${rec.updatedBy}` : ""}` : null}
        erp={{
          id: p.id,
          name: raw.name,
          sku: p.sku ?? "-",
          brand: p.brand ?? "-",
          category: p.category?.name ?? "-",
          price: formatLkr(effectivePrice(p)),
          stock: `${qty} ${qty === 1 ? "unit" : "units"}`,
          availability: isOut(p) ? "out" : isLow(p) ? "low" : "in",
          lastSynced: when(cat.syncedAt),
          connected: health.reachable,
          image: raw.images[0],
        }}
      />
      <AccessoryManager productId={id} variants={raw.variants.map((v) => ({ key: v.key, label: v.label }))} />
    </>
  );
}
