"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  marginHealth,
  type ProductComp,
  type MarginHealth,
} from "@/lib/costing";
import {
  computeForProduct,
  computeProductsLive,
  effectiveSnapshot,
  getLiveMasterInfo,
} from "@/server/costing-service";
import { salesByProduct } from "./sales-actions";
import { toSkuToken, formatCurrency } from "@/lib/utils";
import type { ActionResult } from "./cost-actions";
import type { Prisma, ProductStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof requireSession>>["db"];

const compInputSchema = z.array(
  z.object({
    masterCostId: z.string().min(1),
    quantity: z.coerce.number().positive("Every component needs a quantity greater than 0"),
  }),
);

const productPayloadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  templateId: z.string().optional(), // "" / undefined => Empty Template
  sellingPrice: z.coerce.number().positive("Selling price must be greater than 0"),
  status: z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]).optional(),
});

/** Parse the JSON `comps` field the drawer submits. */
function parseComps(formData: FormData) {
  try {
    return compInputSchema.safeParse(JSON.parse(String(formData.get("comps") || "[]")));
  } catch {
    return null;
  }
}

/**
 * Resolve a product's submitted component list into full snapshot lines, pulling
 * name / unit / current cost from the price book (tenant-scoped). Returns the
 * built lines + the resolved template link, or an error string.
 */
async function buildComps(
  db: Db,
  templateId: string | undefined,
  raw: { masterCostId: string; quantity: number }[],
): Promise<
  | { error: string }
  | { comps: ProductComp[]; templateId: string | null; templateVersionId: string | null; templateName: string | null; category: string | null }
> {
  if (raw.length === 0) return { error: "Add at least one component to the product." };

  const ids = [...new Set(raw.map((r) => r.masterCostId))];
  // Only the id + type are needed — everything else resolves live at read time.
  // Archived items are allowed here (archived ≠ deleted) so an existing product
  // that still references one can be saved.
  const masters = await db.masterCost.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true },
  });
  const byId = new Map(masters.map((m) => [m.id, m]));
  if (byId.size !== ids.length) return { error: "One or more components no longer exist." };

  // Slim comps — IDs + quantity only (Live Reference Architecture).
  const comps: ProductComp[] = raw.map((r) => {
    const mc = byId.get(r.masterCostId)!;
    return {
      masterCostId: mc.id,
      lineType: mc.type === "RAW_MATERIAL" ? "WEIGHT" : "FIXED",
      quantity: r.quantity,
    };
  });

  // Resolve template provenance (optional base). Empty Template => no links.
  let templateLink: { id: string; name: string; category: string | null } | null = null;
  let templateVersionId: string | null = null;
  if (templateId) {
    const template = await db.template.findFirst({
      where: { id: templateId },
      select: { id: true, name: true, category: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true } } },
    });
    if (!template) return { error: "That template no longer exists." };
    templateLink = { id: template.id, name: template.name, category: template.category };
    templateVersionId = template.versions[0]?.id ?? null;
  }

  return {
    comps,
    templateId: templateLink?.id ?? null,
    templateVersionId,
    templateName: templateLink?.name ?? null,
    category: templateLink?.category ?? null,
  };
}

async function uniqueSku(db: Db, base: string): Promise<string> {
  const root = base || "SKU";
  let candidate = root;
  let n = 1;
  while ((await db.product.count({ where: { sku: candidate } })) > 0) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Create / update (drawer-friendly: return a result instead of redirecting)
// ---------------------------------------------------------------------------

export async function createProduct(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = productPayloadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const compsParsed = parseComps(formData);
  if (!compsParsed || !compsParsed.success) return { error: "Could not read the component list." };
  const data = parsed.data;

  const built = await buildComps(db, data.templateId || undefined, compsParsed.data);
  if ("error" in built) return { error: built.error };

  const sku = await uniqueSku(db, data.sku?.trim() || toSkuToken(data.name));

  await db.product.create({
    data: {
      companyId,
      name: data.name,
      sku,
      templateId: built.templateId,
      templateVersionId: built.templateVersionId,
      comps: built.comps as object,
      sellingPrice: data.sellingPrice,
      status: data.status ?? "ACTIVE",
    },
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateProduct(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing product id." };
  const parsed = productPayloadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const compsParsed = parseComps(formData);
  if (!compsParsed || !compsParsed.success) return { error: "Could not read the component list." };
  const data = parsed.data;

  const existing = await db.product.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Product not found." };

  const built = await buildComps(db, data.templateId || undefined, compsParsed.data);
  if ("error" in built) return { error: built.error };

  await db.product.update({
    where: { id },
    data: {
      name: data.name,
      templateId: built.templateId,
      templateVersionId: built.templateVersionId,
      comps: built.comps as object,
      sellingPrice: data.sellingPrice,
      status: data.status,
    },
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProduct(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.product.deleteMany({ where: { id } });
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/products?flash=${encodeURIComponent("Product deleted")}`);
}

// ---------------------------------------------------------------------------
// Data loaders for the drawers
// ---------------------------------------------------------------------------

export interface ProductBreakdown {
  ok: boolean;
  error?: string;
  id: string;
  name: string;
  sku: string;
  status: string;
  templateName: string;
  category: string | null;
  currency: string;
  totalCost: number;
  sellingPrice: number;
  grossMarginAmount: number;
  grossMarginPct: number;
  health: MarginHealth;
  lines: {
    masterCostId: string;
    name: string;
    detail: string;
    lineCost: number;
    sharePct: number;
    archived: boolean;
    needsAttention: boolean;
  }[];
}

/** Preview payload for a single product — reuses the shared costing engine. */
export async function getProductBreakdown(id: string): Promise<ProductBreakdown | { ok: false; error: string }> {
  const { db, companyId } = await requireSession();

  const product = await db.product.findFirst({
    where: { id },
    include: { templateVersion: true, template: { select: { name: true, category: true } } },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, weightUnit: true, marginRedThreshold: true, marginYellowThreshold: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const weightUnit = company?.weightUnit ?? "kg";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  const result = await computeForProduct(db, product);
  const total = result.totalCost || 1;

  return {
    ok: true,
    id: product.id,
    name: product.name,
    sku: product.sku,
    status: product.status,
    templateName: product.template?.name ?? "Custom",
    category: product.template?.category ?? null,
    currency,
    totalCost: result.totalCost,
    sellingPrice: product.sellingPrice,
    grossMarginAmount: result.grossMarginAmount,
    grossMarginPct: result.grossMarginPct,
    health: marginHealth(result.grossMarginPct, thresholds),
    lines: result.lines.map((l) => ({
      masterCostId: l.masterCostId,
      name: l.name,
      detail: l.needsAttention
        ? l.attentionReason === "archived"
          ? "Archived — excluded from total"
          : "Removed — excluded from total"
        : `${l.quantity}${l.lineType === "WEIGHT" ? " " + weightUnit : " " + l.unit} × ${formatCurrency(l.unitCost, currency)}`,
      lineCost: l.lineCost,
      sharePct: total > 0 ? Math.round((l.lineCost / total) * 100) : 0,
      archived: l.archived,
      needsAttention: l.needsAttention,
    })),
  };
}

export interface DraftComp {
  masterCostId: string;
  quantity: number;
  name: string;
  type: string;
  unit: string;
  currentCost: number;
  archived: boolean;
}

export interface ProductDraft {
  ok: boolean;
  error?: string;
  id: string;
  name: string;
  sellingPrice: number;
  status: string;
  templateId: string | null;
  comps: DraftComp[];
}

/** Seed the edit form. Legacy (comps-null) products are upgraded to the comps model. */
export async function getProductDraft(id: string): Promise<ProductDraft | { ok: false; error: string }> {
  const { db } = await requireSession();

  const product = await db.product.findFirst({
    where: { id },
    include: { templateVersion: true, template: { select: { name: true, category: true } } },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const snapshot = effectiveSnapshot(product);
  const info = await getLiveMasterInfo(db, snapshot.lines.map((l) => l.masterCostId));

  const comps: DraftComp[] = snapshot.lines.map((l) => {
    const mc = info[l.masterCostId];
    return {
      masterCostId: l.masterCostId,
      quantity: l.quantity ?? 0,
      name: mc?.name ?? "Removed item",
      type: mc?.type ?? (l.lineType === "WEIGHT" ? "RAW_MATERIAL" : "COMPONENT"),
      unit: mc?.unit ?? "",
      currentCost: mc?.currentCost ?? 0,
      archived: mc?.archived ?? false,
    };
  });

  return {
    ok: true,
    id: product.id,
    name: product.name,
    sellingPrice: product.sellingPrice,
    status: product.status,
    templateId: product.templateId ?? null,
    comps,
  };
}

// ---------------------------------------------------------------------------
// Live search — returns the filtered product rows for the table without a full
// page navigation (called from the client on debounced query/status changes).
// ---------------------------------------------------------------------------

export interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  status: ProductStatus;
  totalCost: number;
  sellingPrice: number;
  grossMarginAmount: number;
  grossMarginPct: number;
  templateName: string | null;
  // Realized-sales rollup (Module 8) — units sold and true profit contribution
  // (realized revenue − live cost × units). Zero when a product has no sales.
  unitsSold: number;
  totalProfit: number;
}

export async function searchProducts(input: { q?: string; status?: string }): Promise<ProductListItem[]> {
  const { db } = await requireSession();

  const where: Prisma.ProductWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q, mode: "insensitive" } },
      { sku: { contains: input.q, mode: "insensitive" } },
    ];
  }
  if (input.status && input.status !== "") where.status = input.status as ProductStatus;

  const rows = await db.product.findMany({
    where,
    include: { template: { select: { name: true, category: true } }, templateVersion: true },
  });

  // Compute-on-read from the live price book, then sort by margin in app (no
  // cached cost columns — Live Reference Architecture).
  const [costs, sales] = await Promise.all([
    computeProductsLive(db, rows),
    salesByProduct(db),
  ]);

  return rows
    .map((p) => {
      const c = costs.get(p.id)!;
      const s = sales.get(p.id);
      const unitsSold = s?.unitsSold ?? 0;
      // Realized profit: actual revenue minus live cost applied to units sold.
      const totalProfit = (s?.revenue ?? 0) - c.totalCost * unitsSold;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status,
        totalCost: c.totalCost,
        sellingPrice: p.sellingPrice,
        grossMarginAmount: c.grossMarginAmount,
        grossMarginPct: c.grossMarginPct,
        templateName: p.template?.name ?? null,
        unitsSold,
        totalProfit,
      };
    })
    .sort((a, b) => b.grossMarginPct - a.grossMarginPct);
}
