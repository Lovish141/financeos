// Discount engine — the single source of truth for how line-item and order-level
// discounts turn list prices into realized (net) revenue. Deliberately pure (no
// DB, no I/O) so the same math powers the sale form preview, the server actions,
// and every margin rollup.

export type DiscountType = "PERCENT" | "FLAT";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The currency amount a discount removes from `base`. PERCENT is clamped to
 * 0–100; FLAT is clamped to never exceed the base (a discount can't create
 * negative revenue). A null/zero discount removes nothing.
 */
export function discountAmount(base: number, type: DiscountType | null | undefined, value: number): number {
  if (!type || !(value > 0) || !(base > 0)) return 0;
  if (type === "PERCENT") return round2((base * Math.min(value, 100)) / 100);
  return round2(Math.min(value, base)); // FLAT
}

/** A line's net unit price = list price minus the per-line discount (never < 0). */
export function netUnitPrice(listPrice: number, type: DiscountType | null | undefined, value: number): number {
  return round2(Math.max(0, listPrice - discountAmount(listPrice, type, value)));
}

export interface LineDiscount {
  listPrice: number; // catalogue unit price
  quantity: number;
  discountType: DiscountType | null;
  discountValue: number;
}

export interface LineTotals {
  listRevenue: number; // listPrice × qty (pre-discount)
  netRevenue: number;  // netUnitPrice × qty (after the line discount only)
  netUnitPrice: number;
  lineDiscount: number; // listRevenue − netRevenue
}

/** Per-line totals after the line-item discount (before any order-level discount). */
export function lineTotals(l: LineDiscount): LineTotals {
  const listRevenue = round2(l.listPrice * l.quantity);
  const net = netUnitPrice(l.listPrice, l.discountType, l.discountValue);
  const netRevenue = round2(net * l.quantity);
  return { listRevenue, netRevenue, netUnitPrice: net, lineDiscount: round2(listRevenue - netRevenue) };
}

export interface OrderDiscountInput {
  lines: LineDiscount[];
  orderDiscountType: DiscountType | null;
  orderDiscountValue: number;
}

export interface OrderTotals {
  listSubtotal: number;   // Σ list revenue (pre any discount)
  lineDiscount: number;   // Σ per-line discounts
  netSubtotal: number;    // Σ net line revenue (after line discounts, before order discount)
  orderDiscount: number;  // order-level discount amount (applied to netSubtotal)
  netTotal: number;       // final realized total
  /** Net revenue attributed to each line after allocating the order discount
   *  pro-rata by net line revenue — parallel to `lines`. */
  perLineNet: number[];
  perLineList: number[];
}

/**
 * Roll a set of lines + an order-level discount into invoice totals, and allocate
 * the order discount back onto each line (pro-rata by net line revenue) so
 * per-product realized revenue can be attributed for margin reporting.
 *
 * The order discount applies to the post-line-discount subtotal (standard invoice
 * semantics: line discounts first, then the invoice-wide deal on the remainder).
 */
export function orderTotals(input: OrderDiscountInput): OrderTotals {
  const per = input.lines.map(lineTotals);
  const listSubtotal = round2(per.reduce((s, l) => s + l.listRevenue, 0));
  const netSubtotal = round2(per.reduce((s, l) => s + l.netRevenue, 0));
  const lineDiscount = round2(listSubtotal - netSubtotal);
  const orderDiscount = discountAmount(netSubtotal, input.orderDiscountType, input.orderDiscountValue);
  const netTotal = round2(netSubtotal - orderDiscount);

  // Allocate the order discount across lines proportionally to their net revenue.
  const perLineNet = per.map((l) =>
    netSubtotal > 0 ? round2(l.netRevenue - orderDiscount * (l.netRevenue / netSubtotal)) : l.netRevenue,
  );

  return {
    listSubtotal,
    lineDiscount,
    netSubtotal,
    orderDiscount,
    netTotal,
    perLineNet,
    perLineList: per.map((l) => l.listRevenue),
  };
}

/** Normalise a submitted discount pair: blank/invalid => no discount (null, 0). */
export function normalizeDiscount(
  type: string | null | undefined,
  value: number | string | null | undefined,
): { type: DiscountType | null; value: number } {
  const v = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const t = type === "PERCENT" || type === "FLAT" ? type : null;
  if (!t || !(v > 0)) return { type: null, value: 0 };
  return { type: t, value: t === "PERCENT" ? Math.min(v, 100) : v };
}
