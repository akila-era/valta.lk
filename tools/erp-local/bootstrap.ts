/**
 * Bootstraps a DISPOSABLE local HEXALYTE ERP (database `hexalyte_valta_test`, backend on :3101) for VALTA.LK integration testing:
 * a test shop with an owner, a small test catalogue, and a registered + configured store (COD on, orders on, reservations on).
 *
 * The store credential is written straight into apps/web/.env.local and never printed.
 *
 * Run from the ERP backend folder (so its Prisma client and env resolve):
 *   DATABASE_URL=<hexalyte_valta_test url> npx tsx E:/valta-lk/tools/erp-local/bootstrap.ts
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const ERP = process.env.ERP_DIR ?? "C:/Users/Akila/CascadeProjects/windsurf-project/apps/backend";
const API = process.env.ERP_API ?? "http://127.0.0.1:3101/api/v1";
const ENV_LOCAL = process.env.VALTA_ENV ?? "E:/valta-lk/apps/web/.env.local";
const erpRequire = createRequire(`${ERP}/package.json`);

if (!/hexalyte_valta_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL must point at the hexalyte_valta_test database");
  process.exit(1);
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const bcrypt = erpRequire("bcryptjs");
  const { prisma } = erpRequire("./src/config/database.ts") as Json;
  const { applyAction } = erpRequire("./src/modules/ecommerce/ecommerce-approval.service.ts") as Json;

  const stamp = "valta";
  const PW = process.env.VALTA_ERP_OWNER_PASSWORD ?? `Valta#${Math.random().toString(36).slice(2, 10)}Aa1`;
  const hash = bcrypt.hashSync(PW, 10);

  // ── tenant, branch, owner, platform admin (idempotent on slug) ───────────────────
  let tenant = await prisma.tenant.findUnique({ where: { slug: "valta-test-shop" } });
  const fresh = !tenant;
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: "VALTA Test Shop", slug: "valta-test-shop", ownerEmail: "owner@valta.test", ownerName: "Valta Owner", status: "ACTIVE" } });
  }
  let branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });
  if (!branch) branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", isHeadquarters: true, address: "1 Test Road", city: "Colombo", state: "Western", phone: "0110000000" } as Json });
  const upsertUser = async (email: string, name: string, role: string, extra: Json = {}) => {
    const u = await prisma.user.findFirst({ where: { email } });
    if (u) { await prisma.user.update({ where: { id: u.id }, data: { password: hash } }); return u; }
    const created = await prisma.user.create({ data: { tenantId: tenant.id, email, name, password: hash, role, ...extra } as Json });
    await prisma.userBranch.create({ data: { userId: created.id, branchId: branch.id } }).catch(() => undefined);
    return created;
  };
  const owner = await upsertUser("owner@valta.test", "Valta Owner", "OWNER");
  let admin = await prisma.user.findFirst({ where: { email: "super@valta.test" } });
  if (!admin) {
    const pt = await prisma.tenant.create({ data: { name: "VALTA platform", slug: "valta-platform", ownerEmail: "super@valta.test", ownerName: "Platform", status: "ACTIVE" } });
    admin = await prisma.user.create({ data: { tenantId: pt.id, email: "super@valta.test", name: "Platform admin", password: hash, role: "PLATFORM_ADMIN", platformAdminRole: "SUPER_ADMIN" } as Json });
  }

  // E-Commerce approval (what the platform Super Admin does), then the customer-credit feature COD dispatch needs.
  const actor = { userId: admin.id, email: admin.email, ip: "127.0.0.1" };
  await applyAction({ tenantId: tenant.id, action: "approve", actor, websiteProjectRef: "VALTA-LK-LOCAL" }).catch((e: Error) => console.log("approve:", e.message.slice(0, 80)));
  await applyAction({ tenantId: tenant.id, action: "enable", actor }).catch((e: Error) => console.log("enable:", e.message.slice(0, 80)));
  const hasFeature = await prisma.tenantFeature.findFirst({ where: { tenantId: tenant.id, feature: "CUSTOMER_CREDIT" } });
  if (!hasFeature) await prisma.tenantFeature.create({ data: { tenantId: tenant.id, feature: "CUSTOMER_CREDIT", enabled: true } as Json });

  // ── test catalogue (clearly test data: names and prices are for local integration testing only) ──
  const cat = async (name: string) =>
    prisma.category.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: name.toLowerCase().replace(/\W+/g, "-") } }, update: {}, create: { tenantId: tenant.id, name, slug: name.toLowerCase().replace(/\W+/g, "-") } });
  const brand = async (name: string) => prisma.brand.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: {}, create: { tenantId: tenant.id, name } });
  const catalogue: { name: string; sku: string; cat: string; brand: string; sub?: string; price: number; stock: number; variants?: Json[] }[] = [
    { name: "Nova X1 Smartphone", sku: "VT-NOVA-X1", cat: "Mobile Phones", brand: "Nova", price: 129900, stock: 0,
      variants: [
        { storage: "128GB", colorName: "Black", colorHex: "#111111", sku: "VT-NOVA-X1-128-BK", stock: 8, sellingPrice: 129900 },
        { storage: "256GB", colorName: "Black", colorHex: "#111111", sku: "VT-NOVA-X1-256-BK", stock: 5, sellingPrice: 149900 },
        { storage: "256GB", colorName: "Blue", colorHex: "#1d4ed8", sku: "VT-NOVA-X1-256-BL", stock: 0, sellingPrice: 149900 },
      ] },
    { name: "Orbit Pro Smartphone", sku: "VT-ORBIT-PRO", cat: "Mobile Phones", brand: "Orbit", price: 219900, stock: 6 },
    { name: "Pulse Wireless Earbuds", sku: "VT-PULSE-EB", cat: "Audio", brand: "Pulse", sub: "Earbuds", price: 14900, stock: 25 },
    { name: "Pulse Over-Ear Headphones", sku: "VT-PULSE-HP", cat: "Audio", brand: "Pulse", sub: "Headphones", price: 24900, stock: 12 },
    { name: "Echo Bluetooth Speaker", sku: "VT-ECHO-SP", cat: "Audio", brand: "Echo", sub: "Speakers", price: 11900, stock: 15 },
    { name: "Volt 20W Fast Charger", sku: "VT-VOLT-CH", cat: "Accessories", brand: "Volt", sub: "Chargers", price: 3900, stock: 40 },
    { name: "Volt USB-C Cable 1m", sku: "VT-VOLT-CB", cat: "Accessories", brand: "Volt", sub: "Cables", price: 1500, stock: 60 },
    { name: "Volt Power Bank 10000", sku: "VT-VOLT-PB", cat: "Accessories", brand: "Volt", sub: "Power Banks", price: 7900, stock: 18 },
    { name: "Atlas Smartwatch", sku: "VT-ATLAS-SW", cat: "Wearables", brand: "Atlas", price: 34900, stock: 9 },
    { name: "Orbit Tablet 10", sku: "VT-ORBIT-TB", cat: "Tablets", brand: "Orbit", price: 89900, stock: 4 },
  ];
  const productIds: string[] = [];
  for (const p of catalogue) {
    const c = await cat(p.cat), b = await brand(p.brand);
    const data = {
      tenantId: tenant.id, branchId: branch.id, name: p.name, sku: p.sku, categoryId: c.id, brandId: b.id, subCategory: p.sub ?? null,
      description: `${p.name} (local integration test product).`, buyingPrice: Math.round(p.price * 0.7), sellingPrice: p.price, wholesalePrice: Math.round(p.price * 0.9),
      creditPrice: p.price, mrp: Math.round(p.price * 1.1), stock: p.stock, storageVariations: p.variants ?? undefined,
    };
    const existing = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } } });
    const row = existing ?? (await prisma.product.create({ data: data as Json }));
    productIds.push(row.id);
  }

  // ── log in as the owner and use the ERP's own API (same calls the ERP web UI makes) ──
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-active-branch-id": branch.id } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, json, text };
  };
  const login = await call("POST", "/auth/login", { email: "owner@valta.test", password: PW });
  const token: string | undefined = login.json?.data?.accessToken ?? login.json?.data?.token ?? login.json?.accessToken;
  if (!token) throw new Error(`owner login failed (${login.status}). If the owner already existed with another password, set VALTA_ERP_OWNER_PASSWORD.`);

  const pickCredential = (d: Json): string => {
    const c = d?.credential;
    return typeof c === "string" ? c : typeof c?.secret === "string" ? c.secret : typeof c?.credential === "string" ? c.credential : "";
  };
  const stores = await call("GET", "/ecommerce/stores", undefined, token);
  let store = (stores.json?.data ?? []).find?.((s: Json) => s.displayName === "VALTA.LK");
  let credential = "";
  if (!store) {
    const reg = await call("POST", "/ecommerce/stores", { displayName: "VALTA.LK", website: "https://valta.lk" }, token);
    if (reg.status >= 300) throw new Error(`register store failed ${reg.status}: ${reg.text.slice(0, 160)}`);
    store = reg.json?.data?.connection ?? reg.json?.data;
    credential = pickCredential(reg.json?.data);
    const en = await call("POST", `/ecommerce/stores/${store.id}/enable`, undefined, token);
    if (en.status >= 300) throw new Error(`enable failed ${en.status}: ${en.text.slice(0, 160)}`);
  } else {
    // The credential is shown only once, so an existing store gets a fresh one (old ones are revoked immediately).
    const rot = await call("POST", `/ecommerce/stores/${store.id}/credentials/rotate`, { graceMinutes: 0 }, token);
    credential = pickCredential(rot.json?.data);
    await call("POST", `/ecommerce/stores/${store.id}/enable`, undefined, token); // no-op (error ignored) when already enabled
  }
  if (!/^hxs_[0-9a-f]{24}\.[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error("did not receive a store credential in the expected format");

  const set = await call("PUT", `/ecommerce/stores/${store.id}/catalogue/settings`, {
    enabled: true, currency: "LKR", fulfilmentBranchIds: [branch.id], reservationsEnabled: true, ordersEnabled: true, onlinePaymentEnabled: false, codEnabled: true, deliveryCharge: "450.00",
  }, token);
  if (set.status >= 300) throw new Error(`catalogue settings failed ${set.status}: ${set.text.slice(0, 200)}`);

  let published = 0;
  for (let i = 0; i < catalogue.length; i++) {
    const p = catalogue[i], id = productIds[i];
    const pricing: Json = p.variants ? {} : { websitePrice: p.price.toFixed(2) };
    if (p.variants) pricing.variantPrices = Object.fromEntries(p.variants.map((v) => [`${v.storage}::${v.colorName}`, Number(v.sellingPrice).toFixed(2)]));
    if (p.sku === "VT-ORBIT-PRO") pricing.discount = { type: "FIXED", value: "20000.00" };
    const pr = await call("PUT", `/ecommerce/stores/${store.id}/catalogue/products/${id}`, pricing, token);
    if (pr.status >= 300) { console.log(`pricing ${p.sku}: ${pr.status} ${pr.text.slice(0, 120)}`); continue; }
    const pub = await call("POST", `/ecommerce/stores/${store.id}/catalogue/products/${id}/publish`, undefined, token);
    if (pub.status < 300) published++; else console.log(`publish ${p.sku}: ${pub.status} ${pub.text.slice(0, 120)}`);
  }

  // ── hand the credential to VALTA (written, never printed) ──
  const lines = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/) : [];
  const setVar = (k: string, v: string) => {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  };
  setVar("HX_API_BASE", `${API}/store-api`);
  setVar("HX_STORE_CREDENTIAL", credential);
  fs.writeFileSync(ENV_LOCAL, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n");

  console.log(JSON.stringify({ freshTenant: fresh, store: store.displayName, productsSeeded: catalogue.length, published, credentialWrittenTo: ENV_LOCAL, ownerLogin: "owner@valta.test", ownerPasswordSetBy: process.env.VALTA_ERP_OWNER_PASSWORD ? "env" : "generated (not shown)" }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("BOOTSTRAP FAILED:", e.message); process.exit(1); });
