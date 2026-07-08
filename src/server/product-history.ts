import { Prisma, type ProductHistoryKind, type ProductStatus } from "@prisma/client";
import type { TenantTx } from "@/lib/tenant";
import { computeProductsLive } from "./costing-service";

/**
 * The product fields a history snapshot needs: the scalar fields it freezes plus
 * the recipe provenance (`template` / `templateVersion`) the costing engine reads
 * to resolve cost. Satisfied by both a freshly written product (with these
 * includes) and the rows returned by `affectedProducts`.
 */
export interface SnapshotProduct {
  id: string;
  name: string;
  sku: string;
  status: ProductStatus;
  sellingPrice: number;
  comps: Prisma.JsonValue | null;
  template?: { name: string | null; category: string | null } | null;
  templateVersion?: { snapshot: Prisma.JsonValue } | null;
}

interface SnapshotMeta {
  /** The user who caused the change (null => system / unknown). */
  actorId?: string | null;
  /** COST_* only: the master cost whose move triggered the revision. */
  triggerMasterCostId?: string | null;
  /** COST_REPRICED only: the exact price-change row that caused it. */
  costHistoryId?: string | null;
}

/**
 * Append a `ProductHistory` row for each product — a self-contained snapshot of
 * its fields, recipe, and the cost resolved *now* (from the live price book, as
 * seen inside the caller's transaction). One `createMany`, so a master-cost
 * fan-out is a single insert. Costs are recomputed here rather than trusted from
 * the caller so every write path produces an identical row shape.
 *
 * MUST be called inside the same `$transaction` as the change it records, so the
 * revision and its trigger (product write / CostHistory row / archived flip)
 * commit atomically — the audit invariant `updateMasterCost` already enforces.
 */
export async function snapshotProducts(
  tx: TenantTx,
  products: SnapshotProduct[],
  kind: ProductHistoryKind,
  meta: SnapshotMeta = {},
): Promise<void> {
  if (products.length === 0) return;

  // Recompute against the price book as seen inside the transaction — after a
  // reprice/archive/restore this reflects the new cost.
  const costs = await computeProductsLive(tx, products);

  await tx.productHistory.createMany({
    data: products.map((p) => {
      const c = costs.get(p.id)!;
      return {
        productId: p.id,
        kind,
        name: p.name,
        sku: p.sku,
        status: p.status,
        sellingPrice: p.sellingPrice,
        // Product.comps uses SQL NULL for "no recipe" (see tenant filters that
        // test `Prisma.DbNull`) — mirror that here rather than JSON `null`.
        comps: p.comps == null ? Prisma.DbNull : (p.comps as Prisma.InputJsonValue),
        totalCost: c.totalCost,
        grossMarginPct: c.grossMarginPct,
        // Resolved per-line breakdown, trimmed to what the detail view renders.
        lines: c.lines.map((l) => ({
          masterCostId: l.masterCostId,
          name: l.name,
          unit: l.unit,
          quantity: l.quantity,
          unitCost: l.unitCost,
          lineCost: l.lineCost,
          needsAttention: l.needsAttention,
        })) as unknown as Prisma.InputJsonValue,
        changedById: meta.actorId ?? null,
        triggerMasterCostId: meta.triggerMasterCostId ?? null,
        costHistoryId: meta.costHistoryId ?? null,
      };
    }),
  });
}
