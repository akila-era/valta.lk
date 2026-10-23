import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { burnPasswordCheck, hashPassword, hashToken, newToken, verifyPassword } from "./password";

export const SESSION_DAYS = 30;
export const RESET_MINUTES = 30;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export interface PublicCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const toPublic = (c: { id: string; name: string; email: string; phone: string | null }): PublicCustomer => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
});

export type AuthError = "EMAIL_TAKEN" | "INVALID_CREDENTIALS" | "LOCKED" | "INVALID_TOKEN";

export class AccountError extends Error {
  constructor(public readonly code: AuthError) {
    super(code);
  }
}

/* ------------------------------------------------------------------ sessions */

export async function createSession(db: PrismaClient, customerId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { tokenHash: hashToken(token), customerId, expiresAt } });
  return { token, expiresAt };
}

export async function customerForSession(db: PrismaClient, token: string | undefined): Promise<PublicCustomer | null> {
  if (!token || token.length > 100) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } });
  if (!s) return null;
  if (s.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  return toPublic(s.customer);
}

export async function destroySession(db: PrismaClient, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/* ------------------------------------------------------------- register/login */

export async function register(
  db: PrismaClient,
  input: { name: string; email: string; phone: string; password: string },
): Promise<PublicCustomer> {
  const passwordHash = await hashPassword(input.password);
  try {
    const c = await db.customer.create({
      data: { name: input.name, email: input.email, phone: input.phone || null, passwordHash },
    });
    return toPublic(c);
  } catch (e) {
    // P2002 = Prisma unique violation; 23505 = the raw Postgres code some driver adapters surface instead.
    const code = (e as { code?: string }).code;
    if (code === "P2002" || code === "23505") throw new AccountError("EMAIL_TAKEN");
    throw e;
  }
}

/** Verifies credentials with per-account lockout. Errors never reveal whether the email exists. */
export async function login(db: PrismaClient, email: string, password: string): Promise<PublicCustomer> {
  const c = await db.customer.findUnique({ where: { email } });
  if (!c) {
    await burnPasswordCheck(password);
    throw new AccountError("INVALID_CREDENTIALS");
  }
  if (c.lockedUntil && c.lockedUntil.getTime() > Date.now()) throw new AccountError("LOCKED");

  if (!(await verifyPassword(password, c.passwordHash))) {
    const failed = c.failedLogins + 1;
    await db.customer.update({
      where: { id: c.id },
      data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
    });
    throw new AccountError(failed >= MAX_FAILED_LOGINS ? "LOCKED" : "INVALID_CREDENTIALS");
  }
  if (c.failedLogins || c.lockedUntil) await db.customer.update({ where: { id: c.id }, data: { failedLogins: 0, lockedUntil: null } });
  return toPublic(c);
}

/* ---------------------------------------------------------------- password reset */

/** Returns a reset token when the account exists (caller emails it); null otherwise. Caller must answer identically either way. */
export async function createResetToken(db: PrismaClient, email: string): Promise<{ token: string; name: string } | null> {
  const c = await db.customer.findUnique({ where: { email } });
  if (!c) return null;
  const token = newToken();
  await db.passwordResetToken.create({
    data: { tokenHash: hashToken(token), customerId: c.id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) },
  });
  return { token, name: c.name };
}

/** Sets a new password, consumes the token, unlocks the account and signs out every existing session. */
export async function resetPassword(db: PrismaClient, token: string, password: string): Promise<PublicCustomer> {
  const t = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!t || t.usedAt || t.expiresAt.getTime() <= Date.now()) throw new AccountError("INVALID_TOKEN");
  const passwordHash = await hashPassword(password);
  const [, c] = await db.$transaction([
    db.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db.customer.update({ where: { id: t.customerId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } }),
    db.session.deleteMany({ where: { customerId: t.customerId } }),
  ]);
  return toPublic(c);
}

/* ------------------------------------------------------------------ profile/orders */

export async function updateProfile(db: PrismaClient, customerId: string, data: { name: string; phone: string }): Promise<PublicCustomer> {
  return toPublic(await db.customer.update({ where: { id: customerId }, data: { name: data.name, phone: data.phone || null } }));
}

/** Records that a customer placed this website order. Idempotent: retries of the same order never duplicate. */
export async function linkOrder(db: PrismaClient, customerId: string, externalRef: string): Promise<void> {
  await db.customerOrder.upsert({ where: { externalRef }, create: { externalRef, customerId }, update: {} });
}

export async function orderRefsFor(db: PrismaClient, customerId: string, take = 20): Promise<string[]> {
  const rows = await db.customerOrder.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => r.externalRef);
}
