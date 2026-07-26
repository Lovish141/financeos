"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeProductsLive } from "@/server/costing-service";
import { parseSalesCsv, SALES_CHANNELS, isFutureDate } from "@/lib/csv";
import { orderTotals, lineTotals, normalizeDiscount, type DiscountType } from "@/lib/discount";
import { matchCustomerIds } from "./customer-actions";
import type { ActionResult } from "./cost-actions";
import type { Prisma, SalesChannel } from "@prisma/client";

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------

// A sale is an order (one customer / date / channel) with one or more product
// line items. The header fields are validated separately from the item array,
// which the drawer submits as a JSON `items` field (mirrors product `comps`).
const DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;

const orderHeaderSchema = z.object({
  soldAt: z.string().min(1, "Sale date is required"),
  channel: z.enum(SALES_CHANNELS).optional().or(z.literal("")),
  customerId: z.string().optional(),
  orderDiscountType: z.enum(DISCOUNT_TYPES).optional().or(z.literal("")),
  orderDiscountValue: z.coerce.number().nonnegative().optional(),
});

const orderItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  // The catalogue/list unit price. The realized net price is this minus the line
  // discount, computed by the discount engine.
  unitPrice: z.coerce.number().nonnegative("Unit price must be ≥ 0"),
  discountType: z.enum(DISCOUNT_TYPES).optional().or(z.literal("")).nullable(),
  discountValue: z.coerce.number().nonnegative().optional(),
});

function toDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

type Db = Awaited<ReturnType<typeof requireStaff>>["db"];

function parseItems(formData: FormData) {
  try {
    return z.array(orderItemSchema).safeParse(JSON.parse(String(formData.get("items") || "[]")));
  } catch {
    return null;
  }
}

/**
 * Validate an optional customerId against this tenant. Returns the id, null when
 * none was chosen, or false when the id doesn't resolve to a customer.
 */
async function resolveCustomerId(db: Db, customerId: string | undefined): Promise<string | null | false> {
  const id = (customerId ?? "").trim();
  if (!id) return null;
  const found = await db.customer.findFirst({ where: { id }, select: { id: true } });
  return found ? found.id : false;
}

/**
 * Shared validation for create/update: header, items, future-date, and that every
 * referenced product + the optional customer belong to this tenant. Returns the
 * resolved values or an error string.
 */
interface ValidatedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number;
}

async function validateOrder(
  db: Db,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      soldAt: Date;
      channel: SalesChannel | null;
      customerId: string | null;
      orderDiscountType: DiscountType | null;
      orderDiscountValue: number;
      items: ValidatedItem[];
    }
> {
  const parsed = orderHeaderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid sale." };
  const header = parsed.data;

  const itemsParsed = parseItems(formData);
  if (!itemsParsed) return { error: "Could not read the product lines." };
  if (!itemsParsed.success) return { error: itemsParsed.error.errors[0]?.message ?? "Invalid product line." };
  const rawItems = itemsParsed.data;
  if (rawItems.length === 0) return { error: "Add at least one product to the sale." };

  const soldAt = toDate(header.soldAt);
  if (!soldAt) return { error: "Invalid sale date." };
  if (isFutureDate(soldAt)) return { error: "Sale date can't be in the future." };

  const productIds = [...new Set(rawItems.map((i) => i.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
  if (products.length !== productIds.length) return { error: "One or more products no longer exist." };

  const customerId = await resolveCustomerId(db, header.customerId);
  if (customerId === false) return { error: "That customer no longer exists." };

  // Normalise every discount through the shared engine so blanks/invalids collapse
  // to "no discount" and percentages are clamped consistently.
  const items: ValidatedItem[] = rawItems.map((i) => {
    const d = normalizeDiscount(i.discountType ?? null, i.discountValue);
    return { productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountType: d.type, discountValue: d.value };
  });
  const od = normalizeDiscount(header.orderDiscountType || null, header.orderDiscountValue);

  return {
    soldAt,
    channel: header.channel ? (header.channel as SalesChannel) : null,
    customerId,
    orderDiscountType: od.type,
    orderDiscountValue: od.value,
    items,
  };
}

export async function createOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role, companyId } = await requireStaff();
  assertCanEdit(role);

  const v = await validateOrder(db, formData);
  if ("error" in v) return { error: v.error };

  await db.order.create({
    data: {
      companyId,
      customerId: v.customerId,
      soldAt: v.soldAt,
      channel: v.channel,
      discountType: v.orderDiscountType,
      discountValue: v.orderDiscountValue,
      items: {
        create: v.items.map((i) => ({
          companyId,
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountType: i.discountType,
          discountValue: i.discountValue,
        })),
      },
    },
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role, companyId } = await requireStaff();
  assertCanEdit(role);

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing sale id." };

  const v = await validateOrder(db, formData);
  if ("error" in v) return { error: v.error };

  const existing = await db.order.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Sale not found." };

  // Replace the line items wholesale — simplest correct semantics for an edit.
  await db.$transaction(async (tx) => {
    await tx.sale.deleteMany({ where: { orderId: id } });
    await tx.order.update({
      where: { id },
      data: {
        customerId: v.customerId,
        soldAt: v.soldAt,
        channel: v.channel,
        discountType: v.orderDiscountType,
        discountValue: v.orderDiscountValue,
        items: {
          create: v.items.map((i) => ({
            companyId,
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountType: i.discountType,
            discountValue: i.discountValue,
          })),
        },
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteOrder(id: string) {
  const { db, role } = await requireStaff();
  assertCanEdit(role);
  await db.order.deleteMany({ where: { id } }); // line items cascade
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// CSV bulk import (mirrors importMasterCostsCsv)
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;        // product line items recorded
  orders?: number;         // orders (invoices) those line items were grouped into
  errors: { line: number; error: string }[];
  // Non-fatal notes: the sale imported, but something needs the user's attention
  // (e.g. a named customer wasn't found or was ambiguous, so it was left unlinked).
  warnings?: { line: number; error: string }[];
  ok?: boolean;
}

export async function importSalesCsv(
  _prev: ImportResult | undefined,
  formData: FormData,
): Promise<ImportResult> {
  const { db, role, companyId } = await requireStaff();
  assertCanEdit(role);

  const file = formData.get("file") as File | null;
  if (!file) return { imported: 0, errors: [{ line: 0, error: "No file uploaded." }] };
  if (file.size === 0) return { imported: 0, errors: [{ line: 0, error: "The uploaded file is empty." }] };

  const { valid, errors, fatal } = parseSalesCsv(await file.text());
  if (fatal) return { imported: 0, errors: [{ line: 1, error: fatal }] };

  // Resolve SKUs -> product ids up-front (tenant-scoped). Rows whose SKU doesn't
  // match a product are reported by line number; valid rows still import.
  const skus = [...new Set(valid.map((v) => v.sku))];
  const products = await db.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));

  // Match named customers to EXISTING master records only — never auto-create, so
  // a stray name can't pollute the customer list. Unmatched/ambiguous names still
  // import the sale (unlinked) and are surfaced as warnings.
  const { byName, ambiguous } = await matchCustomerIds(db, valid.map((v) => v.customer ?? ""));

  const skuErrors: { line: number; error: string }[] = [];
  const warnings: { line: number; error: string }[] = [];

  // Group rows into orders: rows sharing a non-empty `invoice` id become one
  // multi-line order; a row without an invoice id is its own single-line order.
  // Insertion order is preserved so line reporting stays in file order.
  const groups = new Map<string, typeof valid>();
  valid.forEach((v, idx) => {
    const key = v.invoice ? `inv:${v.invoice.toLowerCase()}` : `row:${idx}`;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  });

  type OrderInsert = {
    customerId: string | null;
    soldAt: Date;
    channel: SalesChannel | null;
    orderDiscountType: DiscountType | null;
    orderDiscountValue: number;
    lines: { productId: string; quantity: number; unitPrice: number; discountType: DiscountType | null; discountValue: number }[];
  };
  const orders: OrderInsert[] = [];

  for (const rows of groups.values()) {
    const head = rows[0]; // header (customer / date / channel) comes from the first row

    let customerId: string | null = null;
    if (head.customer) {
      const key = head.customer.trim().toLowerCase();
      if (ambiguous.has(key)) {
        warnings.push({ line: head.line, error: `Customer "${head.customer}" matches more than one record — order imported without a customer link.` });
      } else if (byName.has(key)) {
        customerId = byName.get(key)!;
      } else {
        warnings.push({ line: head.line, error: `Customer "${head.customer}" not found — order imported without a customer link.` });
      }
    }

    const lines: OrderInsert["lines"] = [];
    for (const r of rows) {
      const productId = bySku.get(r.sku.toLowerCase());
      if (!productId) {
        skuErrors.push({ line: r.line, error: `No product with SKU "${r.sku}".` });
        continue;
      }
      lines.push({
        productId,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        discountType: r.lineDiscountType,
        discountValue: r.lineDiscountValue,
      });
    }
    if (lines.length === 0) continue; // every line in this order failed — nothing to record
    // Order-level discount comes from the first row of the invoice group.
    orders.push({
      customerId,
      soldAt: head.soldAt,
      channel: head.channel,
      orderDiscountType: head.orderDiscountType,
      orderDiscountValue: head.orderDiscountValue,
      lines,
    });
  }

  if (orders.length > 0) {
    await db.$transaction(async (tx) => {
      for (const o of orders) {
        await tx.order.create({
          data: {
            companyId,
            customerId: o.customerId,
            soldAt: o.soldAt,
            channel: o.channel,
            discountType: o.orderDiscountType,
            discountValue: o.orderDiscountValue,
            items: {
              create: o.lines.map((l) => ({
                companyId,
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountType: l.discountType,
                discountValue: l.discountValue,
              })),
            },
          },
        });
      }
    });
  }

  const importedLines = orders.reduce((s, o) => s + o.lines.length, 0);

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return {
    imported: importedLines,
    orders: orders.length,
    errors: [...errors, ...skuErrors].sort((a, b) => a.line - b.line),
    warnings: warnings.sort((a, b) => a.line - b.line),
    ok: true,
  };
}

// ---------------------------------------------------------------------------
// Live search — filtered sale rows for the table
// ---------------------------------------------------------------------------

export interface OrderLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number; // list price
  discountType: DiscountType | null;
  discountValue: number;
  listRevenue: number; // unitPrice × qty
  revenue: number;     // net line revenue (after the line discount only)
}

export interface OrderListItem {
  id: string;
  soldAt: string;
  channel: SalesChannel | null;
  customerId: string | null;
  customerName: string | null;
  itemCount: number;
  quantity: number; // total units across all lines
  // Order-level discount + resolved money totals (via the discount engine).
  orderDiscountType: DiscountType | null;
  orderDiscountValue: number;
  listSubtotal: number;   // pre-discount total at list price
  lineDiscountTotal: number;
  orderDiscount: number;
  revenue: number;        // final realized net total
  items: OrderLine[];
}

export async function searchOrders(input: { q?: string; channel?: string; customerId?: string }): Promise<OrderListItem[]> {
  const { db } = await requireStaff();

  const where: Prisma.OrderWhereInput = {};
  if (input.q) {
    where.OR = [
      { items: { some: { product: { name: { contains: input.q, mode: "insensitive" } } } } },
      { items: { some: { product: { sku: { contains: input.q, mode: "insensitive" } } } } },
      { customer: { name: { contains: input.q, mode: "insensitive" } } },
    ];
  }
  if (input.channel && input.channel !== "") where.channel = input.channel as SalesChannel;
  if (input.customerId) where.customerId = input.customerId;

  const rows = await db.order.findMany({
    where,
    orderBy: { soldAt: "desc" },
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      customer: { select: { name: true } },
    },
  });

  return rows.map((o) => {
    const totals = orderTotals({
      lines: o.items.map((it) => ({
        listPrice: it.unitPrice,
        quantity: it.quantity,
        discountType: it.discountType,
        discountValue: it.discountValue,
      })),
      orderDiscountType: o.discountType,
      orderDiscountValue: o.discountValue,
    });
    const items: OrderLine[] = o.items.map((it, idx) => {
      const lt = lineTotals({ listPrice: it.unitPrice, quantity: it.quantity, discountType: it.discountType, discountValue: it.discountValue });
      return {
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        sku: it.product.sku,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountType: it.discountType,
        discountValue: it.discountValue,
        listRevenue: totals.perLineList[idx],
        revenue: lt.netRevenue, // net after the line discount (order discount shown at order level)
      };
    });
    return {
      id: o.id,
      soldAt: o.soldAt.toISOString(),
      channel: o.channel,
      customerId: o.customerId,
      customerName: o.customer?.name ?? null,
      itemCount: items.length,
      quantity: items.reduce((s, x) => s + x.quantity, 0),
      orderDiscountType: o.discountType,
      orderDiscountValue: o.discountValue,
      listSubtotal: totals.listSubtotal,
      lineDiscountTotal: totals.lineDiscount,
      orderDiscount: totals.orderDiscount,
      revenue: totals.netTotal,
      items,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregations — reused by the Products table, dashboard, and simulator.
// ---------------------------------------------------------------------------

export interface ProductSalesAgg {
  unitsSold: number;
  revenue: number;      // Σ realized NET revenue (after line + allocated order discounts)
  listRevenue: number;  // Σ revenue at list price (pre-discount) — for list-margin comparison
  avgUnitPrice: number; // net revenue / unitsSold
}

/**
 * Per-product realized-sales rollup (tenant-scoped), keyed by product id. Revenue
 * is the realized NET money in — list price minus each line discount, minus the
 * order-level discount allocated pro-rata across the order's lines. `listRevenue`
 * keeps the pre-discount figure so the UI can show list vs realized margin.
 */
export async function salesByProduct(
  db: Awaited<ReturnType<typeof requireStaff>>["db"],
): Promise<Map<string, ProductSalesAgg>> {
  // Fetch whole orders so the order-level discount can be allocated across lines.
  const orders = await db.order.findMany({
    select: {
      discountType: true,
      discountValue: true,
      items: { select: { productId: true, quantity: true, unitPrice: true, discountType: true, discountValue: true } },
    },
  });

  const out = new Map<string, ProductSalesAgg>();
  const ensure = (id: string) => {
    let a = out.get(id);
    if (!a) { a = { unitsSold: 0, revenue: 0, listRevenue: 0, avgUnitPrice: 0 }; out.set(id, a); }
    return a;
  };

  for (const o of orders) {
    const totals = orderTotals({
      lines: o.items.map((it) => ({ listPrice: it.unitPrice, quantity: it.quantity, discountType: it.discountType, discountValue: it.discountValue })),
      orderDiscountType: o.discountType,
      orderDiscountValue: o.discountValue,
    });
    o.items.forEach((it, idx) => {
      const a = ensure(it.productId);
      a.unitsSold += it.quantity;
      a.revenue += totals.perLineNet[idx];   // net, order discount already allocated
      a.listRevenue += totals.perLineList[idx];
    });
  }

  for (const agg of out.values()) {
    agg.avgUnitPrice = agg.unitsSold > 0 ? agg.revenue / agg.unitsSold : 0;
  }
  return out;
}

export interface ProductProfitRow {
  id: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;       // realized NET revenue
  listRevenue: number;   // revenue at list price (pre-discount)
  totalCost: number;     // realized cost = live unit cost × units sold
  totalProfit: number;   // realized net revenue − realized cost
  grossMarginPct: number;     // realized (net) margin %
  listMarginPct: number;      // margin % at list price (pre-discount)
  discountDrag: number;       // listRevenue − netRevenue (money given up to discounting)
}

/**
 * Portfolio profit contribution weighted by realized sales volume — live cost
 * from the price book × units sold. Powers the dashboard "top contributor" card
 * and the volume-weighted what-if impact. Sorted by totalProfit desc.
 */
export async function profitByProduct(): Promise<ProductProfitRow[]> {
  const { db } = await requireStaff();

  const [productRows, agg] = await Promise.all([
    db.product.findMany({
      include: { template: { select: { name: true, category: true } }, templateVersion: true },
    }),
    salesByProduct(db),
  ]);

  const costs = await computeProductsLive(db, productRows);

  return productRows
    .map((p) => {
      const a = agg.get(p.id) ?? { unitsSold: 0, revenue: 0, listRevenue: 0, avgUnitPrice: 0 };
      const c = costs.get(p.id)!;
      const totalCost = c.totalCost * a.unitsSold;
      const totalProfit = a.revenue - totalCost;
      const listProfit = a.listRevenue - totalCost;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unitsSold: a.unitsSold,
        revenue: a.revenue,
        listRevenue: a.listRevenue,
        totalCost,
        totalProfit,
        grossMarginPct: a.revenue > 0 ? (totalProfit / a.revenue) * 100 : 0,
        listMarginPct: a.listRevenue > 0 ? (listProfit / a.listRevenue) * 100 : 0,
        discountDrag: a.listRevenue - a.revenue,
      };
    })
    .sort((x, y) => y.totalProfit - x.totalProfit);
}
