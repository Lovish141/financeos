"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBuyer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toRequestView, requestItemsInclude, type RequestView } from "@/server/request-view";
import { parseNotes, makeNote } from "@/lib/request-notes";
import type { ActionResult } from "./cost-actions";
import type { OrderRequestStatus, Prisma } from "@prisma/client";

export type { RequestView, RequestItemView, RequestNote } from "@/server/request-view";

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
  sellingPrice: number;
  productCode: string | null;
  seriesName: string | null; // groups SKUs into a product line — the storefront "category"
}

/** Active products the buyer can order — safe fields only. */
export async function getCatalog(): Promise<CatalogProduct[]> {
  const { db } = await requireBuyer();
  return db.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ seriesName: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sku: true, sellingPrice: true, productCode: true, seriesName: true },
  });
}

// ---- Submit / cancel -------------------------------------------------------

const MAX_ITEMS = 100;
const MAX_QTY = 1_000_000;

const submitItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than 0")
    .finite("Quantity is invalid")
    .lte(MAX_QTY, "Quantity is too large"),
});

// Parse + validate the submitted line items from a FormData "items" field.
function parseItems(formData: FormData): { items: { productId: string; quantity: number }[] } | { error: string } {
  let parsed;
  try {
    parsed = z.array(submitItemSchema).max(MAX_ITEMS, "Too many line items").safeParse(JSON.parse(String(formData.get("items") || "[]")));
  } catch {
    return { error: "Could not read the requested items." };
  }
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid item." };
  if (parsed.data.length === 0) return { error: "Add at least one product to your request." };
  return { items: parsed.data };
}

/** Snapshot current catalog prices, verifying every product is still active. */
async function snapshotPrices(
  db: Awaited<ReturnType<typeof requireBuyer>>["db"],
  items: { productId: string }[],
): Promise<Map<string, number> | { error: string }> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, status: "ACTIVE" },
    select: { id: true, sellingPrice: true },
  });
  if (products.length !== productIds.length) return { error: "One or more products are no longer available." };
  return new Map(products.map((p) => [p.id, p.sellingPrice]));
}

export async function submitOrderRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, companyId, userId, customerId, name } = await requireBuyer();

  const parsed = parseItems(formData);
  if ("error" in parsed) return parsed;
  const { items } = parsed;

  const priceById = await snapshotPrices(db, items);
  if ("error" in priceById) return priceById;

  // The buyer's cover message becomes the first entry in the thread.
  const firstNote = makeNote("BUYER", name, String(formData.get("buyerNote") || ""));
  const notes = firstNote ? [firstNote] : [];

  await db.orderRequest.create({
    data: {
      companyId,
      customerId,
      createdById: userId,
      status: "SUBMITTED",
      submittedAt: new Date(),
      notes: notes as unknown as Prisma.InputJsonValue,
      items: {
        create: items.map((it, idx) => ({
          productId: it.productId,
          requestedQty: it.quantity,
          requestedUnitPrice: priceById.get(it.productId)!,
          sortOrder: idx,
        })),
      },
    },
  });

  revalidatePath("/portal/orders");
  revalidatePath("/requests");
  return { ok: true };
}

// Statuses a buyer may still withdraw from — also the states a buyer may edit.
const CANCELLABLE: OrderRequestStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];
const EDITABLE = CANCELLABLE;

/**
 * Revise the line items of a still-open request (typically after staff send it
 * back with CHANGES_REQUESTED). Re-snapshots catalog prices, replaces the lines,
 * appends an optional buyer note, and puts the request back in the SUBMITTED
 * queue for a fresh review.
 */
export async function editOrderRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, customerId, name } = await requireBuyer();

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing request id." };

  const parsed = parseItems(formData);
  if ("error" in parsed) return parsed;
  const { items } = parsed;

  const req = await db.orderRequest.findFirst({ where: { id, customerId }, select: { status: true, notes: true } });
  if (!req) return { error: "Request not found." };
  if (!EDITABLE.includes(req.status)) return { error: "This request can no longer be edited." };

  const priceById = await snapshotPrices(db, items);
  if ("error" in priceById) return priceById;

  const notes = parseNotes(req.notes);
  const note = makeNote("BUYER", name, String(formData.get("buyerNote") || ""));
  if (note) notes.push(note);

  try {
    await db.$transaction(async (tx) => {
      // Atomic guard — only edit a request that is still open, and re-queue it.
      const claim = await tx.orderRequest.updateMany({
        where: { id, customerId, status: { in: EDITABLE } },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          decidedAt: null,
          decidedById: null,
          notes: notes as unknown as Prisma.InputJsonValue,
        },
      });
      if (claim.count !== 1) throw new Error("closed");

      // Replace the requested lines wholesale (open requests have no approved side).
      await tx.orderRequestItem.deleteMany({ where: { requestId: id } });
      await tx.orderRequestItem.createMany({
        data: items.map((it, idx) => ({
          requestId: id,
          productId: it.productId,
          requestedQty: it.quantity,
          requestedUnitPrice: priceById.get(it.productId)!,
          sortOrder: idx,
        })),
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "closed") return { error: "This request can no longer be edited." };
    throw e;
  }

  revalidatePath("/portal/orders");
  revalidatePath("/requests");
  return { ok: true };
}

/** Post a message to a request's thread without changing its line items. */
export async function postBuyerNote(id: string, text: string): Promise<ActionResult> {
  const { db, customerId, name } = await requireBuyer();

  const note = makeNote("BUYER", name, text);
  if (!note) return { error: "Write a message first." };

  const req = await db.orderRequest.findFirst({ where: { id, customerId }, select: { notes: true } });
  if (!req) return { error: "Request not found." };

  const notes = parseNotes(req.notes);
  notes.push(note);
  await db.orderRequest.update({ where: { id }, data: { notes: notes as unknown as Prisma.InputJsonValue } });

  revalidatePath("/portal/orders");
  revalidatePath("/requests");
  return { ok: true };
}

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
