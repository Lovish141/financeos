"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertCanEdit } from "@/lib/session";
import { toRequestView, type RequestView } from "@/server/request-view";
import type { ActionResult } from "./cost-actions";
import type { OrderRequestStatus, Prisma, SalesChannel } from "@prisma/client";

// ---------------------------------------------------------------------------
// Staff review of buyer order requests. Approval is the ONLY transition that
// writes to Order/Sale: it materializes the approved lines into a booked sale
// and records the requested→approved diff on the request items.
// ---------------------------------------------------------------------------

// Pending statuses a staff member can still act on.
const OPEN_STATUSES: OrderRequestStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];

// Thrown inside a decision transaction when the request was already decided by a
// concurrent request (the atomic status guard matched zero rows).
class AlreadyDecidedError extends Error {}

export interface RequestListItem {
  id: string;
  status: OrderRequestStatus;
  customerId: string;
  customerName: string;
  buyerName: string | null;
  createdAt: string;
  submittedAt: string | null;
  itemCount: number;
  requestedTotal: number;
  approvedTotal: number | null;
}

export async function searchRequests(input: {
  q?: string;
  status?: string;
  customerId?: string;
}): Promise<RequestListItem[]> {
  const { db } = await requireStaff();

  const where: Prisma.OrderRequestWhereInput = {};
  if (input.status && input.status !== "") where.status = input.status as OrderRequestStatus;
  if (input.status === "OPEN") where.status = { in: OPEN_STATUSES };
  if (input.customerId) where.customerId = input.customerId;
  if (input.q) {
    where.OR = [
      { customer: { name: { contains: input.q, mode: "insensitive" } } },
      { items: { some: { product: { name: { contains: input.q, mode: "insensitive" } } } } },
      { items: { some: { product: { sku: { contains: input.q, mode: "insensitive" } } } } },
    ];
  }

  const rows = await db.orderRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { select: { requestedQty: true, requestedUnitPrice: true, approvedQty: true, approvedUnitPrice: true, removed: true } },
    },
  });

  return rows.map((r) => {
    const requestedTotal = r.items.reduce((s, it) => s + (it.requestedQty ?? 0) * (it.requestedUnitPrice ?? 0), 0);
    const approvedTotal =
      r.status === "APPROVED"
        ? r.items.reduce((s, it) => (it.removed ? s : s + (it.approvedQty ?? 0) * (it.approvedUnitPrice ?? 0)), 0)
        : null;
    return {
      id: r.id,
      status: r.status,
      customerId: r.customerId,
      customerName: r.customer.name,
      buyerName: r.createdBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      itemCount: r.items.length,
      requestedTotal,
      approvedTotal,
    };
  });
}

export interface RequestDetail extends RequestView {
  customerId: string;
  customerName: string;
  buyerName: string | null;
  buyerEmail: string | null;
}

export async function getRequestDetail(id: string): Promise<RequestDetail | { error: string }> {
  const { db } = await requireStaff();
  const r = await db.orderRequest.findFirst({
    where: { id },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  if (!r) return { error: "Request not found." };

  // First staff view flips a fresh submission into review.
  if (r.status === "SUBMITTED") {
    await db.orderRequest.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
    r.status = "UNDER_REVIEW";
    revalidatePath("/requests");
  }

  return {
    ...toRequestView(r),
    customerId: r.customerId,
    customerName: r.customer.name,
    buyerName: r.createdBy?.name ?? null,
    buyerEmail: r.createdBy?.email ?? null,
  };
}

// ---- Approve (with full line editing) --------------------------------------

const approveLineSchema = z.object({
  itemId: z.string().optional(), // present for lines that came from the request
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be ≥ 0"),
});

export async function approveRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role, companyId, userId } = await requireStaff();
  assertCanEdit(role);

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing request id." };

  let linesParsed;
  try {
    linesParsed = z.array(approveLineSchema).max(200, "Too many line items").safeParse(JSON.parse(String(formData.get("items") || "[]")));
  } catch {
    return { error: "Could not read the approved lines." };
  }
  if (!linesParsed.success) return { error: linesParsed.error.errors[0]?.message ?? "Invalid line." };
  const lines = linesParsed.data;
  if (lines.length === 0) return { error: "An approved order needs at least one line." };

  const req = await db.orderRequest.findFirst({
    where: { id },
    include: { items: { select: { id: true } }, customer: { select: { id: true, channel: true } } },
  });
  if (!req) return { error: "Request not found." };
  if (!OPEN_STATUSES.includes(req.status)) return { error: "This request has already been decided." };

  // Every referenced product must belong to this tenant.
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
  if (products.length !== productIds.length) return { error: "One or more products no longer exist." };

  // itemIds on lines must be genuine items of this request.
  const validItemIds = new Set(req.items.map((i) => i.id));
  for (const l of lines) {
    if (l.itemId && !validItemIds.has(l.itemId)) return { error: "A line refers to an unknown item." };
  }
  const keptItemIds = new Set(lines.map((l) => l.itemId).filter(Boolean) as string[]);

  try {
    await db.$transaction(async (tx) => {
      // 0. Atomic status guard — flip OPEN -> APPROVED; count 0 means a
      // concurrent decision already closed it, so we roll everything back.
      const claim = await tx.orderRequest.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: { status: "APPROVED", decidedAt: new Date(), decidedById: userId },
      });
      if (claim.count !== 1) throw new AlreadyDecidedError();

      // 1. Book the sale (Order + Sale) from the final approved lines.
      const order = await tx.order.create({
        data: {
          companyId,
          customerId: req.customer.id,
          soldAt: new Date(),
          channel: (req.customer.channel as SalesChannel | null) ?? null,
          items: {
            create: lines.map((l) => ({ companyId, productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
          },
        },
        select: { id: true },
      });

      // 2. Record the diff on the request items.
      let sort = req.items.length;
      for (const l of lines) {
        if (l.itemId) {
          await tx.orderRequestItem.update({
            where: { id: l.itemId },
            data: { productId: l.productId, approvedQty: l.quantity, approvedUnitPrice: l.unitPrice, removed: false },
          });
        } else {
          // Staff-added line — no requested side.
          await tx.orderRequestItem.create({
            data: {
              requestId: id,
              productId: l.productId,
              requestedQty: null,
              requestedUnitPrice: null,
              approvedQty: l.quantity,
              approvedUnitPrice: l.unitPrice,
              sortOrder: sort++,
            },
          });
        }
      }
      // Requested lines the staff dropped.
      for (const it of req.items) {
        if (!keptItemIds.has(it.id)) {
          await tx.orderRequestItem.update({ where: { id: it.id }, data: { removed: true, approvedQty: null, approvedUnitPrice: null } });
        }
      }

      // 3. Link the booked order back to the request.
      await tx.orderRequest.update({ where: { id }, data: { orderId: order.id } });
    });
  } catch (e) {
    if (e instanceof AlreadyDecidedError) return { error: "This request has already been decided." };
    throw e;
  }

  revalidatePath("/requests");
  revalidatePath("/portal/orders");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- Reject / request changes ----------------------------------------------

async function decide(
  id: string,
  status: Extract<OrderRequestStatus, "REJECTED" | "CHANGES_REQUESTED">,
  note: string | undefined,
): Promise<ActionResult> {
  const { db, role, userId } = await requireStaff();
  assertCanEdit(role);

  // Atomic guard — only transition a request that is still open.
  const upd = await db.orderRequest.updateMany({
    where: { id, status: { in: OPEN_STATUSES } },
    data: {
      status,
      reviewNote: (note ?? "").trim() || null,
      // CHANGES_REQUESTED goes back to the buyer, so it isn't a final decision.
      decidedAt: status === "REJECTED" ? new Date() : null,
      decidedById: status === "REJECTED" ? userId : null,
    },
  });
  if (upd.count !== 1) return { error: "This request has already been decided." };

  revalidatePath("/requests");
  revalidatePath("/portal/orders");
  return { ok: true };
}

export async function rejectRequest(id: string, note?: string): Promise<ActionResult> {
  return decide(id, "REJECTED", note);
}

export async function requestChanges(id: string, note?: string): Promise<ActionResult> {
  return decide(id, "CHANGES_REQUESTED", note);
}
