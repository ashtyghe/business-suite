import currency from "npm:currency.js@2";

// ── AUD currency helper ─────────────────────────────────────────────────────
const AUD = (value: number | string) => currency(value, { symbol: "$", precision: 2 });

// ── Formatting ──────────────────────────────────────────────────────────────
export function fmt(n: number): string {
  return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Line item calculations ──────────────────────────────────────────────────
export function lineItemTotal(qty: number, rate: number): number {
  return AUD(qty).multiply(rate).value;
}

export function subtotal(lineItems: { quantity: number; unit_price: number }[]): number {
  return lineItems.reduce(
    (sum, l) => AUD(sum).add(lineItemTotal(l.quantity || 0, l.unit_price || 0)),
    AUD(0),
  ).value;
}

// ── GST (Total Invoice Rule — ATO s 9-90) ──────────────────────────────────
export function gstOnSubtotal(sub: number, taxRate = 10): number {
  return AUD(sub).multiply(taxRate).divide(100).value;
}

export function totalWithGst(sub: number, taxRate = 10): number {
  return AUD(sub).add(gstOnSubtotal(sub, taxRate)).value;
}

export function calcDocumentTotal(
  lineItems: { quantity: number; unit_price: number }[],
  taxRate = 10,
): number {
  const sub = subtotal(lineItems);
  return totalWithGst(sub, taxRate);
}

// ── GST extraction (inclusive amounts) ──────────────────────────────────────
export function extractGst(inclusiveTotal: number): number {
  return AUD(inclusiveTotal).divide(1.1).value;
}

export function gstAmount(inclusiveTotal: number): number {
  return AUD(inclusiveTotal).subtract(extractGst(inclusiveTotal)).value;
}

// ── Markup ──────────────────────────────────────────────────────────────────
export function applyMarkup(amount: number, markupPct: number): number {
  return AUD(amount).multiply(AUD(1).add(AUD(markupPct).divide(100)).value).value;
}

// ── Profit & percentages ────────────────────────────────────────────────────
export function profitMarginPct(revenue: number, cost: number): number {
  return revenue > 0
    ? Math.round(AUD(revenue).subtract(cost).divide(revenue).multiply(100).value)
    : 0;
}

// ── Aggregation helpers ─────────────────────────────────────────────────────
export function sumAmounts(items: { total?: number; amount?: number }[], field = "total"): number {
  return items.reduce(
    (sum, item) => AUD(sum).add(Number((item as Record<string, unknown>)[field]) || 0),
    AUD(0),
  ).value;
}

export function sumWith(items: unknown[], fn: (item: unknown) => number): number {
  return items.reduce(
    (sum: currency, item: unknown) => AUD(sum.value).add(fn(item)),
    AUD(0),
  ).value;
}
