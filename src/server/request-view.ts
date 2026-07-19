import type { OrderRequestStatus, Prisma } from "@prisma/client";

// Shared shapes + mapping for rendering an order request (buyer portal + staff
// review). Kept out of the "use server" action files, which may only export
// async functions.

export interface RequestItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  requestedQty: number | null;
  requestedUnitPrice: number | null;
  approvedQty: number | null;
  approvedUnitPrice: number | null;
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
      removed: it.removed,
    }));

  const requestedTotal = items.reduce(
    (s, it) => s + (it.requestedQty ?? 0) * (it.requestedUnitPrice ?? 0),
    0,
  );
  const approvedTotal =
    r.status === "APPROVED"
      ? items.reduce((s, it) => (it.removed ? s : s + (it.approvedQty ?? 0) * (it.approvedUnitPrice ?? 0)), 0)
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
    requestedTotal,
    approvedTotal,
  };
}
