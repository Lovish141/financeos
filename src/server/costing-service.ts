import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant";
import {
  computeProductCost,
  type TemplateSnapshot,
  type SnapshotLine,
  type CostResult,
} from "@/lib/costing";

/**
 * Build an immutable snapshot of a template's current recipe, embedding each
 * line's unit cost as of *now*. Stored on TemplateVersion so historical product
 * costs stay reproducible even after master costs move (Module 2/3).
 */
export async function buildSnapshot(
  db: TenantDb,
  templateId: string,
  version: number,
): Promise<TemplateSnapshot> {
  const template = await db.template.findFirst({
    where: { id: templateId },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: { masterCost: true },
      },
    },
  });
  if (!template) throw new Error("Template not found");

  const lines: SnapshotLine[] = template.components.map((c) => ({
    masterCostId: c.masterCostId,
    name: c.masterCost.name,
    lineType: c.lineType,
    unit: c.masterCost.unit,
    quantity: c.quantity,
    unitCostAtSnapshot: c.masterCost.currentCost,
  }));

  return {
    version,
    templateName: template.name,
    category: template.category,
    lines,
  };
}

/** Current unit costs for a set of master costs, keyed by id (tenant-scoped). */
export async function getLiveCosts(
  db: TenantDb,
  masterCostIds: string[],
): Promise<Record<string, number>> {
  if (masterCostIds.length === 0) return {};
  const rows = await db.masterCost.findMany({
    where: { id: { in: masterCostIds } },
    select: { id: true, currentCost: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.currentCost]));
}

interface ProductForCost {
  sellingPrice: number;
  comps?: Prisma.JsonValue | null;
  template?: { name: string | null; category: string | null } | null;
  templateVersion?: { snapshot: Prisma.JsonValue } | null;
}

/**
 * The snapshot a product is actually costed against. A product with `comps`
 * carries its own per-line list (built on / diverged from its template); a legacy
 * product falls back to its pinned template-version snapshot. Either way the
 * result is a `TemplateSnapshot`, so `computeProductCost` stays unchanged.
 */
export function effectiveSnapshot(product: ProductForCost): TemplateSnapshot {
  if (product.comps != null) {
    return {
      version: 0,
      templateName: product.template?.name ?? "Custom",
      category: product.template?.category ?? null,
      lines: product.comps as unknown as SnapshotLine[],
    };
  }
  return (product.templateVersion?.snapshot as unknown as TemplateSnapshot) ?? {
    version: 0,
    templateName: product.template?.name ?? "Custom",
    category: product.template?.category ?? null,
    lines: [],
  };
}

/** Compute a single product's cost using the live price book (+ optional overrides). */
export async function computeForProduct(
  db: TenantDb,
  product: ProductForCost,
  overrides?: Record<string, number>,
): Promise<CostResult> {
  const snapshot = effectiveSnapshot(product);
  const ids = snapshot.lines.map((l) => l.masterCostId);
  const liveCosts = await getLiveCosts(db, ids);
  return computeProductCost({
    sellingPrice: product.sellingPrice,
    snapshot,
    liveCosts,
    overrides,
  });
}

/** Recompute and persist one product's cached cost/margin fields. */
export async function recomputeProduct(db: TenantDb, productId: string): Promise<void> {
  const product = await db.product.findFirst({
    where: { id: productId },
    include: { templateVersion: true, template: { select: { name: true, category: true } } },
  });
  if (!product) return;

  const result = await computeForProduct(db, product);

  await db.product.update({
    where: { id: productId },
    data: {
      totalCost: result.totalCost,
      grossMarginAmount: result.grossMarginAmount,
      grossMarginPct: result.grossMarginPct,
      costComputedAt: new Date(),
    },
  });
}

/**
 * Fan-out set for a master cost change (Module 5, technical note): every product
 * whose template currently references this master cost. The
 * TemplateComponent.masterCostId index keeps this fast at scale.
 */
export async function affectedProducts(db: TenantDb, masterCostId: string) {
  const include = {
    templateVersion: true,
    template: { select: { name: true, category: true } },
  } as const;

  // Legacy products: the master cost is referenced by their template's recipe.
  const viaTemplate = await db.product.findMany({
    where: { template: { components: { some: { masterCostId } } } },
    include,
  });

  // Comps-based products: the master cost may appear directly in their per-product
  // line list (JSON — not queryable with `some`, so filter in memory).
  const seen = new Set(viaTemplate.map((p) => p.id));
  const compsProducts = await db.product.findMany({
    where: { comps: { not: Prisma.DbNull } },
    include,
  });
  const viaComps = compsProducts.filter((p) => {
    if (seen.has(p.id)) return false;
    const lines = (p.comps as unknown as SnapshotLine[]) ?? [];
    return lines.some((l) => l.masterCostId === masterCostId);
  });

  return [...viaTemplate, ...viaComps];
}

/**
 * Real incremental recompute after an actual price change. Same traversal path
 * the simulator uses — persists the new cached values for every affected SKU.
 */
export async function recomputeForMasterCost(
  db: TenantDb,
  masterCostId: string,
): Promise<number> {
  const products = await affectedProducts(db, masterCostId);
  for (const product of products) {
    const result = await computeForProduct(db, product);
    await db.product.update({
      where: { id: product.id },
      data: {
        totalCost: result.totalCost,
        grossMarginAmount: result.grossMarginAmount,
        grossMarginPct: result.grossMarginPct,
        costComputedAt: new Date(),
      },
    });
  }
  return products.length;
}
