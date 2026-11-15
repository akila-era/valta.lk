import type { AccessoryLinkInput, AuditInput, AuditProduct, AuditVariant, InvalidRecord, SpecRow } from "./types";

/**
 * Lenient reading of a catalogue snapshot. The Agent's own wire schema is STRICT (one bad price rejects a whole listing page); an audit must
 * read what is there and say what is wrong, so nothing here throws: a bad value becomes a null plus a stated problem, an unreadable record
 * becomes an `InvalidRecord`.
 */
const MAX_PRODUCTS = 200_000;
const DECIMAL = /^\d+(\.\d{1,2})?$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export interface Money {
  value: number | null;
  /** True only when the Agent's decimal rule would accept it: a string like "1000.00". */
  wireOk: boolean;
  problem: string | null;
}

/** Reads a price. A number type, a thousands comma, a currency symbol or three decimals are all PROBLEMS even though the value can be read. */
export function parseMoney(v: unknown): Money {
  if (v === undefined || v === null || v === "") return { value: null, wireOk: false, problem: "missing" };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { value: null, wireOk: false, problem: "not_a_number" };
    return { value: v, wireOk: false, problem: "number_type" };
  }
  if (typeof v !== "string") return { value: null, wireOk: false, problem: "wrong_type" };
  if (DECIMAL.test(v)) return { value: Number(v), wireOk: true, problem: null };
  const cleaned = v.replace(/rs\.?|lkr|රු\.?|₨|\s/gi, "");
  const symbol = cleaned !== v.replace(/\s/g, "");
  const comma = /,/.test(cleaned);
  const bare = cleaned.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(bare)) return { value: null, wireOk: false, problem: "not_numeric" };
  const n = Number(bare);
  if (!Number.isFinite(n)) return { value: null, wireOk: false, problem: "not_a_number" };
  const problem = n < 0 ? "negative" : comma ? "thousands_separator" : symbol ? "currency_symbol" : /\.\d{3,}$/.test(bare) ? "too_many_decimals" : "format";
  return { value: n, wireOk: false, problem };
}

/** zod 4 `z.number().int()` accepts only SAFE integers; the parity test in tests/unit/catalogue-intel-input.test.ts guards this. */
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** What the Agent's `RawProduct` zod schema would refuse. Parity with the real schema is tested; keep it in step with src/backend/wire.ts. */
export function wireProblems(r: Rec): string[] {
  const out: string[] = [];
  const nullishStr = (k: string) => {
    const v = r[k];
    if (v !== undefined && v !== null && typeof v !== "string") out.push(`${k}: not a string`);
  };
  if (typeof r.id !== "string") out.push("id: not a string");
  if (typeof r.name !== "string") out.push("name: not a string");
  for (const k of ["sku", "description", "brand", "category", "subCategory", "model", "condition", "warrantyNote", "salePrice", "publishedAt"]) {
    if (k === "salePrice") {
      const v = r[k];
      if (v !== undefined && v !== null && !(typeof v === "string" && DECIMAL.test(v))) out.push("salePrice: not a decimal string");
    } else nullishStr(k);
  }
  if (!(typeof r.price === "string" && DECIMAL.test(r.price))) out.push("price: not a decimal string");
  if (r.warrantyMonths !== undefined && r.warrantyMonths !== null && !isInt(r.warrantyMonths)) out.push("warrantyMonths: not an integer");
  if (typeof r.updatedAt !== "string") out.push("updatedAt: required string missing");
  for (const k of ["discountActive", "hasVariants"]) if (r[k] !== undefined && typeof r[k] !== "boolean") out.push(`${k}: not a boolean`);
  if (r.availability !== undefined && typeof r.availability !== "string") out.push("availability: not a string");
  if (r.purchasableQuantity !== undefined && !isInt(r.purchasableQuantity)) out.push("purchasableQuantity: not an integer");
  if (r.images !== undefined) {
    if (!Array.isArray(r.images)) out.push("images: not an array");
    else if (r.images.some((i) => !isRec(i) || typeof i.url !== "string")) out.push("images: an entry has no url string");
  }
  if (r.variants !== undefined) {
    if (!Array.isArray(r.variants)) out.push("variants: not an array");
    else
      r.variants.forEach((v, i) => {
        if (!isRec(v)) {
          out.push(`variants[${i}]: not an object`);
          return;
        }
        if (typeof v.key !== "string") out.push(`variants[${i}].key: not a string`);
        if (!(typeof v.price === "string" && DECIMAL.test(v.price))) out.push(`variants[${i}].price: not a decimal string`);
        if (v.salePrice !== undefined && v.salePrice !== null && !(typeof v.salePrice === "string" && DECIMAL.test(v.salePrice))) out.push(`variants[${i}].salePrice: not a decimal string`);
        for (const k of ["sku", "storage", "color"]) if (v[k] !== undefined && v[k] !== null && typeof v[k] !== "string") out.push(`variants[${i}].${k}: not a string`);
        if (v.discountActive !== undefined && typeof v.discountActive !== "boolean") out.push(`variants[${i}].discountActive: not a boolean`);
        if (v.availability !== undefined && typeof v.availability !== "string") out.push(`variants[${i}].availability: not a string`);
        if (v.purchasableQuantity !== undefined && !isInt(v.purchasableQuantity)) out.push(`variants[${i}].purchasableQuantity: not an integer`);
      });
  }
  return out;
}

function readVariant(v: unknown): AuditVariant | null {
  if (!isRec(v)) return null;
  const key = str(v.key);
  if (!key) return null;
  const price = parseMoney(v.price);
  const sale = parseMoney(v.salePrice);
  const qty = typeof v.purchasableQuantity === "number" && Number.isFinite(v.purchasableQuantity) ? v.purchasableQuantity : null;
  return {
    key,
    ...(str(v.sku) ? { sku: str(v.sku)! } : {}),
    ...(str(v.storage) ? { storage: str(v.storage)! } : {}),
    ...(str(v.color) ? { color: str(v.color)! } : {}),
    price: price.value,
    priceWireOk: price.wireOk,
    salePrice: sale.value,
    discountActive: v.discountActive === true,
    availability: typeof v.availability === "string" ? v.availability : "UNKNOWN",
    qty,
  };
}

export function readProduct(r: unknown, index: number): AuditProduct | InvalidRecord {
  if (!isRec(r)) return { index, reason: "record is not an object" };
  const id = typeof r.id === "string" ? r.id : typeof r.id === "number" ? String(r.id) : "";
  if (!id) return { index, reason: "record has no id" };
  const name = typeof r.name === "string" ? r.name : "";
  const price = parseMoney(r.price);
  const sale = parseMoney(r.salePrice);
  const variantsRaw = Array.isArray(r.variants) ? r.variants : [];
  const variants = variantsRaw.map(readVariant).filter((v): v is AuditVariant => v !== null);
  const images = Array.isArray(r.images) ? r.images : [];
  const imageUrls = images.map((i) => (isRec(i) && typeof i.url === "string" ? i.url : "")).filter(Boolean);
  const desc = typeof r.description === "string" ? r.description : undefined;
  const qty = typeof r.purchasableQuantity === "number" && Number.isFinite(r.purchasableQuantity) ? r.purchasableQuantity : null;
  return {
    index,
    id,
    name,
    nameLength: name.length,
    ...(str(r.sku) ? { sku: str(r.sku)! } : {}),
    ...(str(r.externalId) ? { externalId: str(r.externalId)! } : {}),
    ...(desc !== undefined ? { description: desc.slice(0, 20_000) } : {}),
    descriptionLength: desc?.length ?? 0,
    ...(str(r.brand) ? { brand: str(r.brand)! } : {}),
    ...(str(r.category) ? { category: str(r.category)! } : {}),
    ...(str(r.subCategory) ? { subCategory: str(r.subCategory)! } : {}),
    ...(str(r.model) ? { model: str(r.model)! } : {}),
    ...(str(r.condition) ? { condition: str(r.condition)! } : {}),
    warrantyMonths: typeof r.warrantyMonths === "number" && Number.isFinite(r.warrantyMonths) ? r.warrantyMonths : null,
    imageCount: images.length,
    imageUrls: imageUrls.slice(0, 20),
    price: price.value,
    priceProblem: price.problem,
    priceWireOk: price.wireOk,
    salePrice: sale.value,
    discountActive: r.discountActive === true,
    variants,
    invalidVariants: variantsRaw.length - variants.length,
    availability: typeof r.availability === "string" ? r.availability : "UNKNOWN",
    qty,
    ...(str(r.publishedAt) ? { publishedAt: str(r.publishedAt)! } : {}),
    ...(str(r.updatedAt) ? { updatedAt: str(r.updatedAt)! } : {}),
    wireProblems: wireProblems(r),
  };
}

/** Finds the product list in the shapes the relay and the ERP produce: a bare array, `{items}`, `{data:{items}}`, `{data:[...]}`, or an array of pages. */
export function extractItems(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((p) => isRec(p) && Array.isArray(p.items) && p.id === undefined)) return raw.flatMap((p) => (p as Rec).items as unknown[]);
    return raw;
  }
  if (!isRec(raw)) return null;
  if (Array.isArray(raw.items)) return raw.items;
  if (isRec(raw.data)) return extractItems(raw.data);
  if (Array.isArray(raw.data)) return raw.data;
  return null;
}

export function readContent(raw: unknown): Record<string, SpecRow[]> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const out: Record<string, SpecRow[]> = {};
  const rows = (v: unknown): SpecRow[] =>
    (Array.isArray(v) ? v : [])
      .filter(isRec)
      .map((s) => ({
        name: typeof s.name === "string" ? s.name.trim().slice(0, 120) : "",
        value: typeof s.value === "string" ? s.value.trim().slice(0, 400) : typeof s.value === "number" ? String(s.value) : "",
        ...(typeof s.unit === "string" && s.unit.trim() ? { unit: s.unit.trim().slice(0, 40) } : {}),
        ...(typeof s.group === "string" && s.group.trim() ? { group: s.group.trim().slice(0, 80) } : {}),
      }))
      .filter((s) => s.name || s.value)
      .slice(0, 200);
  const list = extractItems(raw);
  if (list) {
    for (const it of list) if (isRec(it) && typeof it.id === "string") out[it.id] = rows(it.specs);
    return out;
  }
  if (isRec(raw)) {
    for (const [id, v] of Object.entries(raw)) if (isRec(v)) out[id] = rows(v.specs);
    return out;
  }
  return undefined;
}

export function readLinks(raw: unknown): AccessoryLinkInput[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const list = extractItems(raw) ?? (Array.isArray(raw) ? raw : null);
  if (!list) return undefined;
  const out: AccessoryLinkInput[] = [];
  for (const l of list) {
    if (!isRec(l)) continue;
    const s = str(l.sourceItemId);
    const a = str(l.accessoryItemId);
    if (s && a) out.push({ sourceItemId: s, accessoryItemId: a, ...(str(l.kind) ? { kind: str(l.kind)! } : {}) });
  }
  return out;
}

export function readSnapshot(raw: unknown, extra: { content?: unknown; links?: unknown; currency?: string } = {}): AuditInput {
  const items = extractItems(raw) ?? [];
  const products: AuditProduct[] = [];
  const invalid: InvalidRecord[] = [];
  items.slice(0, MAX_PRODUCTS).forEach((r, i) => {
    const p = readProduct(r, i);
    if ("reason" in p) invalid.push(p);
    else products.push(p);
  });
  if (items.length > MAX_PRODUCTS) invalid.push({ index: MAX_PRODUCTS, reason: `${items.length - MAX_PRODUCTS} records beyond the ${MAX_PRODUCTS} limit were not read` });
  const content = readContent(extra.content);
  const links = readLinks(extra.links);
  const currency = extra.currency ?? (isRec(raw) && isRec(raw.settings) && typeof raw.settings.currency === "string" ? raw.settings.currency : undefined);
  return { products, invalid, ...(content ? { content } : {}), ...(links ? { links } : {}), ...(currency ? { currency } : {}) };
}
