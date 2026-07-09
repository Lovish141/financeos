"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeProductsLive } from "@/server/costing-service";
import { parseSalesCsv, SALES_CHANNELS } from "@/lib/csv";
import { resolveCustomerIds } from "./customer-actions";
import type { ActionResult } from "./cost-actions";
import type { Prisma, SalesChannel } from "@prisma/client";

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------

const saleSchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().nonnegative("Unit price must be ≥ 0"),
  soldAt: z.string().min(1, "Sale date is required"),
  channel: z.enum(SALES_CHANNELS).optional().or(z.literal("")),
  customerId: z.string().optional(),
});

function toDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

type Db = Awaited<ReturnType<typeof requireSession>>["db"];

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

export async function createSale(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = saleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const soldAt = toDate(data.soldAt);
  if (!soldAt) return { error: "Invalid sale date." };

  // Confirm the product belongs to this tenant (tenantDb scopes the query).
  const product = await db.product.findFirst({ where: { id: data.productId }, select: { id: true } });
  if (!product) return { error: "That product no longer exists." };

  const customerId = await resolveCustomerId(db, data.customerId);
  if (customerId === false) return { error: "That customer no longer exists." };

  await db.sale.create({
    data: {
      companyId,
      productId: data.productId,
      customerId,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      soldAt,
      channel: data.channel ? (data.channel as SalesChannel) : null,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateSale(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing sale id." };
  const parsed = saleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const soldAt = toDate(data.soldAt);
  if (!soldAt) return { error: "Invalid sale date." };

  const existing = await db.sale.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Sale not found." };

  const product = await db.product.findFirst({ where: { id: data.productId }, select: { id: true } });
  if (!product) return { error: "That product no longer exists." };

  const customerId = await resolveCustomerId(db, data.customerId);
  if (customerId === false) return { error: "That customer no longer exists." };

  await db.sale.update({
    where: { id },
    data: {
      productId: data.productId,
      customerId,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      soldAt,
      channel: data.channel ? (data.channel as SalesChannel) : null,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteSale(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.sale.deleteMany({ where: { id } });
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// CSV bulk import (mirrors importMasterCostsCsv)
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  errors: { line: number; error: string }[];
  ok?: boolean;
}

export async function importSalesCsv(
  _prev: ImportResult | undefined,
  formData: FormData,
): Promise<ImportResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { imported: 0, errors: [{ line: 0, error: "No file uploaded." }] };

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

  // Find-or-create customers named on the rows so each sale links to master data.
  const customerIds = await resolveCustomerIds(db, companyId, valid.map((v) => v.customer ?? "").filter(Boolean) as string[]);

  const toInsert: { productId: string; customerId: string | null; quantity: number; unitPrice: number; soldAt: Date; channel: SalesChannel | null }[] = [];
  const skuErrors: { line: number; error: string }[] = [];
  valid.forEach((v, i) => {
    const productId = bySku.get(v.sku.toLowerCase());
    if (!productId) {
      // Recover the original line number: valid rows are in file order but skip
      // failed ones, so we can't map 1:1. Report by SKU instead.
      skuErrors.push({ line: i + 2, error: `No product with SKU "${v.sku}".` });
      return;
    }
    toInsert.push({
      productId,
      customerId: v.customer ? customerIds.get(v.customer.trim()) ?? null : null,
      quantity: v.quantity,
      unitPrice: v.unitPrice,
      soldAt: v.soldAt,
      channel: v.channel,
    });
  });

  if (toInsert.length > 0) {
    await db.$transaction(async (tx) => {
      for (const s of toInsert) {
        await tx.sale.create({ data: { companyId, ...s } });
      }
    });
  }

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  return { imported: toInsert.length, errors: [...errors, ...skuErrors].sort((a, b) => a.line - b.line), ok: true };
}

// ---------------------------------------------------------------------------
// Live search — filtered sale rows for the table
// ---------------------------------------------------------------------------

export interface SaleListItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  customerId: string | null;
  customerName: string | null;
  quantity: number;
  unitPrice: number;
  revenue: number;
  soldAt: string;
  channel: SalesChannel | null;
}

export async function searchSales(input: { q?: string; channel?: string; customerId?: string }): Promise<SaleListItem[]> {
  const { db } = await requireSession();

  const where: Prisma.SaleWhereInput = {};
  if (input.q) {
    where.OR = [
      { product: { name: { contains: input.q, mode: "insensitive" } } },
      { product: { sku: { contains: input.q, mode: "insensitive" } } },
      { customer: { name: { contains: input.q, mode: "insensitive" } } },
    ];
  }
  if (input.channel && input.channel !== "") where.channel = input.channel as SalesChannel;
  if (input.customerId) where.customerId = input.customerId;

  const rows = await db.sale.findMany({
    where,
    orderBy: { soldAt: "desc" },
    include: { product: { select: { name: true, sku: true } }, customer: { select: { name: true } } },
  });

  return rows.map((s) => ({
    id: s.id,
    productId: s.productId,
    productName: s.product.name,
    sku: s.product.sku,
    customerId: s.customerId,
    customerName: s.customer?.name ?? null,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    revenue: s.quantity * s.unitPrice,
    soldAt: s.soldAt.toISOString(),
    channel: s.channel,
  }));
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
  db: Awaited<ReturnType<typeof requireSession>>["db"],
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
  const { db } = await requireSession();

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
