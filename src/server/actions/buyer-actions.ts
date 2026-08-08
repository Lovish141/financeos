"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBuyer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toRequestView, requestItemsInclude, type RequestView } from "@/server/request-view";
import type { ActionResult } from "./cost-actions";
import type { OrderRequestStatus } from "@prisma/client";

export type { RequestView, RequestItemView } from "@/server/request-view";

// ---------------------------------------------------------------------------
// Buyer portal — catalog browsing and order-request submission. Everything here
// runs under a BUYER session and is additionally scoped to the buyer's own
// Customer. The catalog read path deliberately exposes ONLY name/sku/price —
// never cost, margin, or BOM.
// ---------------------------------------------------------------------------

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number; // list price
}

export interface BuyerCatalog {
  products: CatalogProduct[];
  /** The buyer's contracted standing discount %, or null when they have none. */
  discountPct: number | null;
}

/**
 * Active products the buyer can order — safe fields only (never cost/margin/BOM),
 * plus the buyer's standing discount so the portal quotes their contracted price
 * rather than raw list. The discount is applied at the invoice level (see
 * `submitOrderRequest`), matching how staff-entered sales work.
 */
export async function getCatalog(): Promise<BuyerCatalog> {
  const { db, customerId } = await requireBuyer();
  const [products, customer] = await Promise.all([
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    }),
    db.customer.findFirst({ where: { id: customerId }, select: { defaultDiscountPct: true } }),
  ]);
  return { products, discountPct: customer?.defaultDiscountPct ?? null };
}

// ---- Submit / cancel -------------------------------------------------------

const MAX_ITEMS = 100;
const MAX_QTY = 1_000_000;
const MAX_NOTE = 2000;

const submitItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than 0")
    .finite("Quantity is invalid")
    .lte(MAX_QTY, "Quantity is too large"),
});

export async function submitOrderRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, companyId, userId, customerId } = await requireBuyer();

  const buyerNote = String(formData.get("buyerNote") || "").trim().slice(0, MAX_NOTE) || null;

  let itemsParsed;
  try {
    itemsParsed = z.array(submitItemSchema).max(MAX_ITEMS, "Too many line items").safeParse(JSON.parse(String(formData.get("items") || "[]")));
  } catch {
    return { error: "Could not read the requested items." };
  }
  if (!itemsParsed.success) return { error: itemsParsed.error.errors[0]?.message ?? "Invalid item." };
  const items = itemsParsed.data;
  if (items.length === 0) return { error: "Add at least one product to your request." };

  // Snapshot catalog prices for the requested products (active only, tenant-scoped).
  const productIds = [...new Set(items.map((i) => i.productId))];
  const [products, customer] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, status: "ACTIVE" },
      select: { id: true, sellingPrice: true },
    }),
    db.customer.findFirst({ where: { id: customerId }, select: { defaultDiscountPct: true } }),
  ]);
  const priceById = new Map(products.map((p) => [p.id, p.sellingPrice]));
  if (products.length !== productIds.length) {
    return { error: "One or more products are no longer available." };
  }

  // Carry the buyer's standing discount onto the request so the price they were
  // quoted is the price staff review — and, on approval, the price that books.
  const standing = customer?.defaultDiscountPct ?? null;

  await db.orderRequest.create({
    data: {
      companyId,
      customerId,
      createdById: userId,
      status: "SUBMITTED",
      submittedAt: new Date(),
      buyerNote,
      discountType: standing && standing > 0 ? "PERCENT" : null,
      discountValue: standing && standing > 0 ? standing : 0,
      items: {
        create: items.map((it, idx) => ({
          productId: it.productId,
          requestedQty: it.quantity,
          requestedUnitPrice: priceById.get(it.productId)!, // list price
          sortOrder: idx,
        })),
      },
    },
  });

  revalidatePath("/portal/orders");
  revalidatePath("/requests");
  return { ok: true };
}

// Statuses a buyer may still withdraw from.
const CANCELLABLE: OrderRequestStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];

export async function cancelOrderRequest(id: string): Promise<ActionResult> {
  const { db, customerId } = await requireBuyer();
  const req = await db.orderRequest.findFirst({ where: { id, customerId }, select: { status: true } });
  if (!req) return { error: "Request not found." };
  if (!CANCELLABLE.includes(req.status)) return { error: "This request can no longer be cancelled." };

  await db.orderRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/portal/orders");
  revalidatePath("/requests");
  return { ok: true };
}

/** The signed-in buyer's own requests (newest first). */
export async function getMyRequests(): Promise<RequestView[]> {
  const { db, customerId } = await requireBuyer();
  const rows = await db.orderRequest.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: requestItemsInclude,
  });
  return rows.map(toRequestView);
}

/** Buyer's tenant currency, for money formatting in the portal. */
export async function buyerCurrency(): Promise<string> {
  const { companyId } = await requireBuyer();
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
  return c?.baseCurrency ?? "INR";
}
