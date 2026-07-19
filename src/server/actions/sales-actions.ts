"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeProductsLive } from "@/server/costing-service";
import { parseSalesCsv, SALES_CHANNELS, isFutureDate } from "@/lib/csv";
import { matchCustomerIds } from "./customer-actions";
import type { ActionResult } from "./cost-actions";
import type { Prisma, SalesChannel } from "@prisma/client";

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------

// A sale is an order (one customer / date / channel) with one or more product
// line items. The header fields are validated separately from the item array,
// which the drawer submits as a JSON `items` field (mirrors product `comps`).
const orderHeaderSchema = z.object({
  soldAt: z.string().min(1, "Sale date is required"),
  channel: z.enum(SALES_CHANNELS).optional().or(z.literal("")),
  customerId: z.string().optional(),
});

const orderItemSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be ≥ 0"),
});

function toDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

type Db = Awaited<ReturnType<typeof requireStaff>>["db"];
type OrderItem = z.infer<typeof orderItemSchema>;

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
async function validateOrder(
  db: Db,
  formData: FormData,
): Promise<{ error: string } | { soldAt: Date; channel: SalesChannel | null; customerId: string | null; items: OrderItem[] }> {
  const parsed = orderHeaderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid sale." };
  const header = parsed.data;

  const itemsParsed = parseItems(formData);
  if (!itemsParsed) return { error: "Could not read the product lines." };
  if (!itemsParsed.success) return { error: itemsParsed.error.errors[0]?.message ?? "Invalid product line." };
  const items = itemsParsed.data;
  if (items.length === 0) return { error: "Add at least one product to the sale." };

  const soldAt = toDate(header.soldAt);
  if (!soldAt) return { error: "Invalid sale date." };
  if (isFutureDate(soldAt)) return { error: "Sale date can't be in the future." };

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true } });
  if (products.length !== productIds.length) return { error: "One or more products no longer exist." };

  const customerId = await resolveCustomerId(db, header.customerId);
  if (customerId === false) return { error: "That customer no longer exists." };

  return { soldAt, channel: header.channel ? (header.channel as SalesChannel) : null, customerId, items };
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
      items: {
        create: v.items.map((i) => ({ companyId, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      },
    },
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
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
        items: {
          create: v.items.map((i) => ({ companyId, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        },
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
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
    lines: { productId: string; quantity: number; unitPrice: number }[];
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
      lines.push({ productId, quantity: r.quantity, unitPrice: r.unitPrice });
    }
    if (lines.length === 0) continue; // every line in this order failed — nothing to record
    orders.push({ customerId, soldAt: head.soldAt, channel: head.channel, lines });
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
            items: { create: o.lines.map((l) => ({ companyId, productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })) },
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
  unitPrice: number;
  revenue: number;
}

export interface OrderListItem {
  id: string;
  soldAt: string;
  channel: SalesChannel | null;
  customerId: string | null;
  customerName: string | null;
  itemCount: number;
  quantity: number; // total units across all lines
  revenue: number;  // total order revenue
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
    const items: OrderLine[] = o.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      sku: it.product.sku,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      revenue: it.quantity * it.unitPrice,
    }));
    return {
      id: o.id,
      soldAt: o.soldAt.toISOString(),
      channel: o.channel,
      customerId: o.customerId,
      customerName: o.customer?.name ?? null,
      itemCount: items.length,
      quantity: items.reduce((s, x) => s + x.quantity, 0),
      revenue: items.reduce((s, x) => s + x.revenue, 0),
      items,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregations — reused by the Products table, dashboard, and simulator.
// ---------------------------------------------------------------------------

export interface ProductSalesAgg {
  unitsSold: number;
  revenue: number;      // Σ quantity × realized unitPrice
  avgUnitPrice: number; // revenue / unitsSold
}

/**
 * Per-product realized-sales rollup (tenant-scoped), keyed by product id. Uses
 * realized unit prices — the actual money in, which may differ from catalog.
 */
export async function salesByProduct(
  db: Awaited<ReturnType<typeof requireStaff>>["db"],
): Promise<Map<string, ProductSalesAgg>> {
  const grouped = await db.sale.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
  });

  // groupBy can't sum a derived qty×price, so pull the rows for revenue.
  const rows = await db.sale.findMany({ select: { productId: true, quantity: true, unitPrice: true } });
  const out = new Map<string, ProductSalesAgg>();
  for (const g of grouped) {
    out.set(g.productId, { unitsSold: g._sum.quantity ?? 0, revenue: 0, avgUnitPrice: 0 });
  }
  for (const r of rows) {
    const agg = out.get(r.productId);
    if (agg) agg.revenue += r.quantity * r.unitPrice;
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
  revenue: number;
  totalCost: number;   // realized cost = live unit cost × units sold
  totalProfit: number; // realized revenue − realized cost
  grossMarginPct: number;
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
      const a = agg.get(p.id) ?? { unitsSold: 0, revenue: 0, avgUnitPrice: 0 };
      const c = costs.get(p.id)!;
      const totalCost = c.totalCost * a.unitsSold;
      const totalProfit = a.revenue - totalCost;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unitsSold: a.unitsSold,
        revenue: a.revenue,
        totalCost,
        totalProfit,
        grossMarginPct: a.revenue > 0 ? (totalProfit / a.revenue) * 100 : 0,
      };
    })
    .sort((x, y) => y.totalProfit - x.totalProfit);
}
