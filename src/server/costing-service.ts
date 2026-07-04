import { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant";
import {
  computeProductCost,
  type TemplateSnapshot,
  type SnapshotLine,
  type MasterInfo,
  type CostResult,
} from "@/lib/costing";

/**
 * Build a structure-only snapshot of a template's current recipe (IDs +
 * quantities, no master-cost field copies). Stored on TemplateVersion for
 * provenance/history — costs always resolve live at read time.
 */
export async function buildSnapshot(
  db: TenantDb,
  templateId: string,
  version: number,
): Promise<TemplateSnapshot> {
  const template = await db.template.findFirst({
    where: { id: templateId },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) throw new Error("Template not found");

  const lines: SnapshotLine[] = template.components.map((c) => ({
    masterCostId: c.masterCostId,
    lineType: c.lineType,
    quantity: c.quantity,
  }));

  return {
    version,
    templateName: template.name,
    category: template.category,
    lines,
  };
}

/**
 * Live master-cost facts for a set of ids, keyed by id (tenant-scoped). The
 * single source of truth for name/unit/cost/archived across every read path.
 */
export async function getLiveMasterInfo(
  db: TenantDb,
  masterCostIds: string[],
): Promise<Record<string, MasterInfo>> {
  if (masterCostIds.length === 0) return {};
  const rows = await db.masterCost.findMany({
    where: { id: { in: masterCostIds } },
    select: { id: true, name: true, unit: true, type: true, currentCost: true, archived: true },
  });
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      { name: r.name, unit: r.unit, type: r.type, currentCost: r.currentCost, archived: r.archived },
    ]),
  );
}

interface ProductForCost {
  sellingPrice: number;
  comps?: Prisma.JsonValue | null;
  template?: { name: string | null; category: string | null } | null;
  templateVersion?: { snapshot: Prisma.JsonValue } | null;
}

/**
 * The recipe a product is costed against. A product with `comps` carries its own
 * per-line list (built on / diverged from its template — this is what insulates
 * it from template edits); a legacy product falls back to its pinned
 * template-version snapshot. Either way the result is a slim `TemplateSnapshot`.
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

/** Compute a single product's cost from the live price book (+ optional overrides). */
export async function computeForProduct(
  db: TenantDb,
  product: ProductForCost,
  overrides?: Record<string, number>,
): Promise<CostResult> {
  const snapshot = effectiveSnapshot(product);
  const masterInfo = await getLiveMasterInfo(db, snapshot.lines.map((l) => l.masterCostId));
  return computeProductCost({
    sellingPrice: product.sellingPrice,
    snapshot,
    masterInfo,
    overrides,
  });
}

/**
 * Batch compute-on-read for a set of products — one price-book lookup for all of
 * them (avoids N+1 on the product list + dashboard). Returns a map by product id.
 */
export async function computeProductsLive<T extends ProductForCost & { id: string }>(
  db: TenantDb,
  products: T[],
): Promise<Map<string, CostResult>> {
  const ids = new Set<string>();
  for (const p of products) {
    for (const l of effectiveSnapshot(p).lines) ids.add(l.masterCostId);
  }
  const masterInfo = await getLiveMasterInfo(db, [...ids]);

  const out = new Map<string, CostResult>();
  for (const p of products) {
    const snapshot = effectiveSnapshot(p);
    out.set(p.id, computeProductCost({ sellingPrice: p.sellingPrice, snapshot, masterInfo }));
  }
  return out;
}

/**
 * Every product whose recipe references a given master cost — via a template it's
 * built on (indexed) or directly in its per-product comps (JSON, filtered in
 * memory). Used by the impact warning and the what-if simulator (Module 5).
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
 * Like {@link affectedProducts} but for a set of master costs at once — every
 * product whose recipe references *any* of the given ids. Used by the multi-input
 * what-if simulator (Module 5): one fan-out query instead of N.
 */
export async function affectedProductsMany(db: TenantDb, masterCostIds: string[]) {
  if (masterCostIds.length === 0) return [];
  const idSet = new Set(masterCostIds);
  const include = {
    templateVersion: true,
    template: { select: { name: true, category: true } },
  } as const;

  const viaTemplate = await db.product.findMany({
    where: { template: { components: { some: { masterCostId: { in: masterCostIds } } } } },
    include,
  });

  const seen = new Set(viaTemplate.map((p) => p.id));
  const compsProducts = await db.product.findMany({
    where: { comps: { not: Prisma.DbNull } },
    include,
  });
  const viaComps = compsProducts.filter((p) => {
    if (seen.has(p.id)) return false;
    const lines = (p.comps as unknown as SnapshotLine[]) ?? [];
    return lines.some((l) => idSet.has(l.masterCostId));
  });

  return [...viaTemplate, ...viaComps];
}
