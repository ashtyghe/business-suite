import currency from "currency.js";

// ── AUD currency helper ─────────────────────────────────────────────────────
const AUD = (value) => currency(value, { symbol: "$", precision: 2 });

// ── Formatting ──────────────────────────────────────────────────────────────
export const fmt = (n) =>
  `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Line item calculations ──────────────────────────────────────────────────
export const lineItemTotal = (qty, rate) => AUD(qty).multiply(rate).value;

export const subtotal = (lineItems) =>
  lineItems.reduce((sum, l) => AUD(sum).add(lineItemTotal(l.qty, l.rate)), AUD(0)).value;

// ── GST (Total Invoice Rule — ATO s 9-90) ──────────────────────────────────
// Calculate GST at full precision per line, sum, round once at total
export const gstOnSubtotal = (sub, taxRate = 10) =>
  AUD(sub).multiply(taxRate).divide(100).value;

export const totalWithGst = (sub, taxRate = 10) =>
  AUD(sub).add(gstOnSubtotal(sub, taxRate)).value;

// Full document total from line items + tax rate
export const calcDocumentTotal = (lineItems, taxRate = 10) => {
  const sub = subtotal(lineItems);
  return totalWithGst(sub, taxRate);
};

// ── GST extraction (inclusive amounts) ──────────────────────────────────────
export const extractGst = (inclusiveTotal) =>
  AUD(inclusiveTotal).divide(1.1).value;

export const gstAmount = (inclusiveTotal) =>
  AUD(inclusiveTotal).subtract(extractGst(inclusiveTotal)).value;

// ── Markup ──────────────────────────────────────────────────────────────────
export const applyMarkup = (amount, markupPct) =>
  AUD(amount).multiply(AUD(1).add(AUD(markupPct).divide(100)).value).value;

export const markupAmount = (amount, markupPct) =>
  AUD(amount).multiply(AUD(markupPct).divide(100).value).value;

// ── Labour & margin ─────────────────────────────────────────────────────────
export const labourCost = (hours, costRate) =>
  AUD(hours).multiply(costRate).value;

export const applyMargin = (cost, marginPct) =>
  applyMarkup(cost, marginPct);

// ── Profit & percentages ────────────────────────────────────────────────────
export const profitMarginPct = (revenue, cost) =>
  revenue > 0 ? Math.round(AUD(revenue).subtract(cost).divide(revenue).multiply(100).value) : 0;

export const budgetVariance = (estimated, actual) =>
  AUD(estimated).subtract(actual).value;

export const budgetPct = (actual, estimated) =>
  estimated > 0 ? Math.min(100, Math.round(AUD(actual).divide(estimated).multiply(100).value)) : 0;

// ── Aggregation helpers ─────────────────────────────────────────────────────
export const sumAmounts = (items, field = "amount") =>
  items.reduce((sum, item) => AUD(sum).add(item[field] || 0), AUD(0)).value;

export const sumWith = (items, fn) =>
  items.reduce((sum, item) => AUD(sum).add(fn(item)), AUD(0)).value;
