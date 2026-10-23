/** Money is handled in integer cents (1/100 LKR) to avoid floating point drift. */
export function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0));
}

export function multiplyMoney(unit: number, qty: number): number {
  return fromCents(toCents(unit) * qty);
}

const formatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatLkr(amount: number): string {
  return formatter.format(amount).replace(/ /g, " ");
}

/** Parses an ERP decimal string ("1250.50") to a number without float parsing artefacts. */
export function parseDecimal(s: string): number {
  const [int, frac = ""] = s.split(".");
  return fromCents(Number(int) * 100 + Number((frac + "00").slice(0, 2)));
}

/** Formats a number as the ERP wire format: a decimal string with exactly 2 decimals. */
export function toDecimalString(amount: number): string {
  return fromCents(toCents(amount)).toFixed(2);
}
