import type { OrderRequestStatus, Prisma } from "@prisma/client";
import { orderTotals, type DiscountType } from "@/lib/discount";

// Shared shapes + mapping for rendering an order request (buyer portal + staff
// review). Kept out of the "use server" action files, which may only export
// async functions.

export interface RequestItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  requestedQty: number | null;
  requestedUnitPrice: number | null; // list price
  approvedQty: number | null;
  approvedUnitPrice: number | null;  // list price
  approvedDiscountType: DiscountType | null;
  approvedDiscountValue: number;
  removed: boolean;
}

export interface RequestView {
  id: string;
  status: OrderRequestStatus;
  buyerNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  items: RequestItemView[];
  /** Invoice-wide discount (from the customer's standing agreement, editable at approval). */
  discountType: DiscountType | null;
  discountValue: number;
  /** Requested lines at list price, before any discount. */
  requestedSubtotal: number;
  /** What the buyer was quoted — requested lines net of the order discount. */
  requestedTotal: number;
  approvedTotal: number | null; // null until approved
}

export const requestItemsInclude = {
  items: { include: { product: { select: { name: true, sku: true } } } },
} as const;

export type RequestRow = Prisma.OrderRequestGetPayload<{
  include: typeof requestItemsInclude;
}>;

/** Map a request row (+items+product) into the shared view shape. */
export function toRequestView(r: RequestRow): RequestView {
  const items: RequestItemView[] = r.items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      sku: it.product.sku,
      requestedQty: it.requestedQty,
      requestedUnitPrice: it.requestedUnitPrice,
      approvedQty: it.approvedQty,
      approvedUnitPrice: it.approvedUnitPrice,
      approvedDiscountType: it.approvedDiscountType,
      approvedDiscountValue: it.approvedDiscountValue,
      removed: it.removed,
    }));

  // Requested side: list lines netted through the request's order-level discount,
  // so the buyer sees the same figure staff review.
  const requestedSubtotal = items.reduce(
    (s, it) => s + (it.requestedQty ?? 0) * (it.requestedUnitPrice ?? 0),
    0,
  );
  const requested = orderTotals({
    lines: items
      .filter((it) => it.requestedQty != null)
      .map((it) => ({
        listPrice: it.requestedUnitPrice ?? 0,
        quantity: it.requestedQty ?? 0,
        discountType: null,
        discountValue: 0,
      })),
    orderDiscountType: r.discountType,
    orderDiscountValue: r.discountValue,
  });

  // Approved side: kept lines with their own line discounts, then the order discount.
  const approvedTotal =
    r.status === "APPROVED"
      ? orderTotals({
          lines: items
            .filter((it) => !it.removed && it.approvedQty != null)
            .map((it) => ({
              listPrice: it.approvedUnitPrice ?? 0,
              quantity: it.approvedQty ?? 0,
              discountType: it.approvedDiscountType,
              discountValue: it.approvedDiscountValue,
            })),
          orderDiscountType: r.discountType,
          orderDiscountValue: r.discountValue,
        }).netTotal
      : null;

  return {
    id: r.id,
    status: r.status,
    buyerNote: r.buyerNote,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    items,
    discountType: r.discountType,
    discountValue: r.discountValue,
    requestedSubtotal,
    requestedTotal: requested.netTotal,
    approvedTotal,
  };
}
