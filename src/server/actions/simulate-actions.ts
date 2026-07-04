"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { affectedProducts, getLiveCosts } from "@/server/costing-service";
import { computeProductCost, marginHealth, type TemplateSnapshot, type MarginHealth } from "@/lib/costing";
import { prisma } from "@/lib/prisma";

export interface SimImpact {
  productId: string;
  name: string;
  sku: string;
  beforeCost: number;
  afterCost: number;
  beforeMarginAmount: number;
  afterMarginAmount: number;
  beforeMarginPct: number;
  afterMarginPct: number;
  afterHealth: MarginHealth;
  deltaMarginAmount: number;
  goesNegative: boolean;
}

export interface SimResult {
  ok: boolean;
  error?: string;
  masterCostName?: string;
  currentPrice?: number;
  newPrice?: number;
  currency?: string;
  affectedCount?: number;
  goingNegative?: number;
  impacts?: SimImpact[];
}

const schema = z.object({
  masterCostId: z.string().min(1, "Choose a cost item"),
  newPrice: z.coerce.number().nonnegative("Price must be ≥ 0"),
});

/**
 * Single-input what-if simulation (Module 5). Finds the affected SKU set via the
 * indexed fan-out query, recomputes each in memory with the hypothetical price,
 * and returns before/after. Strictly non-destructive: zero writes to MasterCost,
 * Product, or CostHistory.
 */
export async function runSimulation(
  _prev: SimResult | undefined,
  formData: FormData,
): Promise<SimResult> {
  const { db, companyId } = await requireSession();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const { masterCostId, newPrice } = parsed.data;

  const [masterCost, company] = await Promise.all([
    db.masterCost.findFirst({ where: { id: masterCostId }, select: { name: true, currentCost: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true, marginRedThreshold: true, marginYellowThreshold: true } }),
  ]);
  if (!masterCost) return { ok: false, error: "Cost item not found." };

  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  const products = await affectedProducts(db, masterCostId);

  // One live-cost fetch across all affected snapshots.
  const allIds = new Set<string>();
  for (const p of products) {
    const snap = p.templateVersion.snapshot as unknown as TemplateSnapshot;
    snap.lines.forEach((l) => allIds.add(l.masterCostId));
  }
  const liveCosts = await getLiveCosts(db, [...allIds]);
  const overrides = { [masterCostId]: newPrice };

  const impacts: SimImpact[] = products.map((p) => {
    const snapshot = p.templateVersion.snapshot as unknown as TemplateSnapshot;
    const before = computeProductCost({ brassWeight: p.brassWeight, sellingPrice: p.sellingPrice, snapshot, liveCosts });
    const after = computeProductCost({ brassWeight: p.brassWeight, sellingPrice: p.sellingPrice, snapshot, liveCosts, overrides });
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      beforeCost: before.totalCost,
      afterCost: after.totalCost,
      beforeMarginAmount: before.grossMarginAmount,
      afterMarginAmount: after.grossMarginAmount,
      beforeMarginPct: before.grossMarginPct,
      afterMarginPct: after.grossMarginPct,
      afterHealth: marginHealth(after.grossMarginPct, thresholds),
      deltaMarginAmount: Math.round((after.grossMarginAmount - before.grossMarginAmount) * 100) / 100,
      goesNegative: after.grossMarginAmount < 0 && before.grossMarginAmount >= 0,
    };
  });

  // Rank by absolute margin impact (biggest movers first).
  impacts.sort((a, b) => Math.abs(b.deltaMarginAmount) - Math.abs(a.deltaMarginAmount));

  return {
    ok: true,
    masterCostName: masterCost.name,
    currentPrice: masterCost.currentCost,
    newPrice,
    currency: company?.baseCurrency ?? "INR",
    affectedCount: impacts.length,
    goingNegative: impacts.filter((i) => i.afterMarginAmount < 0).length,
    impacts,
  };
}
