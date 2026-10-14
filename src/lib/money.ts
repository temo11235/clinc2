/** Monetary helpers — all amounts are stored as integer minor units (piasters). */

export function toMinor(input: string | number): number {
  const value = typeof input === "number" ? input : Number(String(input).replace(/,/g, "").trim());
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

export function formatEGP(minor: number, locale = "ar-EG"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(fromMinor(minor ?? 0));
}

export function sumMinor(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + Math.round(v ?? 0), 0);
}

export function lineTotalMinor(unitPriceMinor: number, quantity: number): number {
  return Math.round(unitPriceMinor) * Math.max(1, Math.round(quantity));
}

export function invoiceTotals(
  items: Array<{ unitPriceMinor: number; quantity: number }>,
  discountMinor: number,
) {
  const subtotalMinor = sumMinor(items.map((i) => lineTotalMinor(i.unitPriceMinor, i.quantity)));
  const discount = Math.min(Math.max(0, Math.round(discountMinor)), subtotalMinor);
  return { subtotalMinor, discountMinor: discount, totalMinor: subtotalMinor - discount };
}
