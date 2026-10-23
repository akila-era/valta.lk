/**
 * Customer account logic against an in-process PostgreSQL (PGlite) with the real migration SQL applied.
 * No external database is touched.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import {
  AccountError,
  createResetToken,
  createSession,
  customerForSession,
  destroySession,
  linkOrder,
  login,
  MAX_FAILED_LOGINS,
  orderRefsFor,
  register,
  resetPassword,
  updateProfile,
} from "@/lib/auth/accounts";
import { hashPassword, hashToken, verifyPassword } from "@/lib/auth/password";
import { loginSchema, registerSchema } from "@/lib/validation/account";

let pg: PGlite;
let db: PrismaClient;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec(`TRUNCATE "CustomerOrder", "PasswordResetToken", "Session", "Customer" CASCADE`);
});

const alice = () => registerSchema.parse({ name: "Alice Perera", email: "  Alice@Example.COM ", phone: "077 123 4567", password: "secret123" });

describe("password hashing", () => {
  it("hashes with a random salt and verifies only the right password", async () => {
    const a = await hashPassword("secret123");
    const b = await hashPassword("secret123");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("secret123", a)).toBe(true);
    expect(await verifyPassword("secret124", a)).toBe(false);
    expect(await verifyPassword("secret123", "garbage")).toBe(false);
  });
});

describe("validation", () => {
  it("normalises email and phone, and enforces password strength", () => {
    expect(alice()).toMatchObject({ email: "alice@example.com", phone: "+94771234567" });
    expect(registerSchema.safeParse({ ...alice(), password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...alice(), password: "lettersonly" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...alice(), phone: "12345" }).success).toBe(false);
    expect(registerSchema.parse({ ...alice(), phone: "" }).phone).toBe("");
    expect(loginSchema.safeParse({ email: "x@y.lk", password: "" }).success).toBe(false);
  });
});

describe("register + login + sessions", () => {
  it("registers once per email (case-insensitive) and never stores the plain password", async () => {
    const c = await register(db, alice());
    expect(c).toMatchObject({ name: "Alice Perera", email: "alice@example.com", phone: "+94771234567" });
    const row = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.passwordHash).not.toContain("secret123");
    await expect(register(db, registerSchema.parse({ ...alice(), email: "ALICE@example.com" }))).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("logs in with the right password; wrong password and unknown email give the same error", async () => {
    await register(db, alice());
    await expect(login(db, "alice@example.com", "secret123")).resolves.toMatchObject({ email: "alice@example.com" });
    const wrong = await login(db, "alice@example.com", "nope").catch((e) => e);
    const unknown = await login(db, "nobody@example.com", "nope").catch((e) => e);
    expect(wrong).toBeInstanceOf(AccountError);
    expect(wrong.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.code).toBe("INVALID_CREDENTIALS");
  });

  it(`locks the account after ${MAX_FAILED_LOGINS} failures, even for the right password`, async () => {
    await register(db, alice());
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) await expect(login(db, "alice@example.com", "bad")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(login(db, "alice@example.com", "bad")).rejects.toMatchObject({ code: "LOCKED" });
    await expect(login(db, "alice@example.com", "secret123")).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("successful login resets the failure counter", async () => {
    const c = await register(db, alice());
    await login(db, "alice@example.com", "bad").catch(() => undefined);
    await login(db, "alice@example.com", "secret123");
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).failedLogins).toBe(0);
  });

  it("sessions store only a hash of the token, expire, and can be destroyed", async () => {
    const c = await register(db, alice());
    const { token } = await createSession(db, c.id);
    const row = await db.session.findFirstOrThrow({ where: { customerId: c.id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(await customerForSession(db, token)).toMatchObject({ id: c.id });
    expect(await customerForSession(db, "forged-token")).toBeNull();
    expect(await customerForSession(db, undefined)).toBeNull();

    await db.session.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await customerForSession(db, token)).toBeNull();
    expect(await db.session.count()).toBe(0); // expired session cleaned up

    const s2 = await createSession(db, c.id);
    await destroySession(db, s2.token);
    expect(await customerForSession(db, s2.token)).toBeNull();
  });
});

describe("password reset", () => {
  it("does nothing for unknown emails", async () => {
    expect(await createResetToken(db, "nobody@example.com")).toBeNull();
    expect(await db.passwordResetToken.count()).toBe(0);
  });

  it("resets once, unlocks the account and signs out every session", async () => {
    const c = await register(db, alice());
    const old = await createSession(db, c.id);
    await db.customer.update({ where: { id: c.id }, data: { lockedUntil: new Date(Date.now() + 600_000) } });
    const t = (await createResetToken(db, "alice@example.com"))!;
    await resetPassword(db, t.token, "newpass456");
    expect(await customerForSession(db, old.token)).toBeNull();
    await expect(login(db, "alice@example.com", "newpass456")).resolves.toMatchObject({ id: c.id });
    await expect(login(db, "alice@example.com", "secret123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(resetPassword(db, t.token, "another789")).rejects.toMatchObject({ code: "INVALID_TOKEN" }); // single use
  });

  it("rejects expired and unknown tokens", async () => {
    await register(db, alice());
    const t = (await createResetToken(db, "alice@example.com"))!;
    await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword(db, t.token, "newpass456")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(resetPassword(db, "x".repeat(43), "newpass456")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

describe("profile + orders", () => {
  it("updates the profile and links website orders idempotently, newest first", async () => {
    const c = await register(db, alice());
    expect(await updateProfile(db, c.id, { name: "Alice P.", phone: "" })).toMatchObject({ name: "Alice P.", phone: null });
    await linkOrder(db, c.id, "VLK-261020-AAAAAAAAAA");
    await new Promise((r) => setTimeout(r, 5));
    await linkOrder(db, c.id, "VLK-261020-BBBBBBBBBB");
    await linkOrder(db, c.id, "VLK-261020-BBBBBBBBBB"); // retry of the same order
    expect(await orderRefsFor(db, c.id)).toEqual(["VLK-261020-BBBBBBBBBB", "VLK-261020-AAAAAAAAAA"]);
  });
});
