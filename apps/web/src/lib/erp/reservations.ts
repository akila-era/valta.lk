import "server-only";
import { z } from "zod";
import { erpRequest } from "./client";
import { endpoints } from "./endpoints";
import { reservationSchema } from "./types";
import type { LineRequest } from "./availability";

const DEFAULT_TTL_SECONDS = 900;

/**
 * Holds stock for a cart (no stock is deducted). `externalRef` is the idempotency identity: repeating the
 * same call returns the same reservation. Orders normally create their own hold, so checkout does not need this.
 */
export async function createReservation(externalRef: string, lines: LineRequest[], ttlSeconds = DEFAULT_TTL_SECONDS) {
  const r = await erpRequest(endpoints.reservations(), reservationSchema, {
    method: "POST",
    idempotencyKey: externalRef,
    body: {
      externalRef,
      ttlSeconds,
      lines: lines.map((l) => ({ itemId: l.productId, ...(l.variantKey ? { variantKey: l.variantKey } : {}), quantity: l.quantity })),
    },
  });
  return { reservationRef: r.externalRef, expiresAt: r.expiresAt };
}

export async function releaseReservation(reservationRef: string): Promise<void> {
  await erpRequest(endpoints.releaseReservation(reservationRef), z.unknown(), {
    method: "POST",
    idempotencyKey: `release-${reservationRef}`,
  });
}
