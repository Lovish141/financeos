"use server";

import { z } from "zod";
import { requireSession, canEdit } from "@/lib/session";
import { affectedProductsMany, effectiveSnapshot, getLiveMasterInfo } from "@/server/costing-service";
import { computeProductCost, marginHealth, type MarginHealth } from "@/lib/costing";
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

/** One simulated input, echoed back with its resolved base price for the UI. */
export interface SimInput {
  masterCostId: string;
  name: string;
  unit: string;
  currentPrice: number;
  newPrice: number;
}

export interface SimResult {
  ok: boolean;
  error?: string;
  inputs?: SimInput[];
  currency?: string;
  affectedCount?: number;
  goingNegative?: number;
  impacts?: SimImpact[];
}

const inputsSchema = z
  .array(
    z.object({
      masterCostId: z.string().min(1),
      newPrice: z.coerce.number().nonnegative("Price must be ≥ 0"),
    }),
  )
  .min(1, "Select at least one item to simulate");

/**
 * Multi-input what-if simulation (Module 5). Takes a set of hypothetical prices,
 * finds every SKU affected by *any* of them via the indexed fan-out query,
 * recomputes each in memory applying all overrides at once, and returns
 * before/after. Strictly non-destructive: zero writes to MasterCost, Product, or
 * CostHistory. The core costing engine already supports multiple overrides, so
 * this only fans the selection out.
 */
export async function runSimulation(
  _prev: SimResult | undefined,
  formData: FormData,
): Promise<SimResult> {
  const { db, companyId } = await requireSession();

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("inputs") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the simulation inputs." };
  }
  const parsed = inputsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const requested = parsed.data;
  const ids = [...new Set(requested.map((i) => i.masterCostId))];

  const [masterCosts, company] = await Promise.all([
    db.masterCost.findMany({
      where: { id: { in: ids }, archived: false },
      select: { id: true, name: true, unit: true, currentCost: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrency: true, marginRedThreshold: true, marginYellowThreshold: true },
    }),
  ]);
  if (masterCosts.length === 0) return { ok: false, error: "None of the selected cost items were found." };

  const byId = new Map(masterCosts.map((m) => [m.id, m]));
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  // Resolve the requested inputs against the live price book (drop any that no
  // longer exist / were archived) and build the override map for the engine.
  const inputs: SimInput[] = [];
  const overrides: Record<string, number> = {};
  for (const r of requested) {
    const mc = byId.get(r.masterCostId);
    if (!mc) continue;
    inputs.push({
      masterCostId: mc.id,
      name: mc.name,
      unit: mc.unit,
      currentPrice: mc.currentCost,
      newPrice: r.newPrice,
    });
    overrides[mc.id] = r.newPrice;
  }
  if (inputs.length === 0) return { ok: false, error: "None of the selected cost items were found." };

  const products = await affectedProductsMany(db, inputs.map((i) => i.masterCostId));

  // One live master-info fetch across all affected snapshots.
  const allIds = new Set<string>();
  for (const p of products) {
    effectiveSnapshot(p).lines.forEach((l) => allIds.add(l.masterCostId));
  }
  const masterInfo = await getLiveMasterInfo(db, [...allIds]);

  const impacts: SimImpact[] = products.map((p) => {
    const snapshot = effectiveSnapshot(p);
    const before = computeProductCost({ sellingPrice: p.sellingPrice, snapshot, masterInfo });
    const after = computeProductCost({ sellingPrice: p.sellingPrice, snapshot, masterInfo, overrides });
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
    inputs,
    currency: company?.baseCurrency ?? "INR",
    affectedCount: impacts.length,
    goingNegative: impacts.filter((i) => i.afterMarginAmount < 0).length,
    impacts,
  };
}

export interface SaveSettingsResult {
  ok?: boolean;
  error?: string;
}

/**
 * Persist the user's simulator setup on the company — the *selected* master-cost
 * items only (ids). Hypothetical values are never saved; the simulator always
 * reopens each input at its live base price.
 */
export async function saveSimSettings(masterCostIds: string[]): Promise<SaveSettingsResult> {
  const { db, companyId, role } = await requireSession();
  if (!canEdit(role)) return { error: "You don't have permission to save the simulation setup." };

  // Keep only ids that still exist and are active, in a stable order.
  const rows = await db.masterCost.findMany({
    where: { id: { in: [...new Set(masterCostIds)] }, archived: false },
    select: { id: true },
  });
  const valid = rows.map((r) => r.id);

  await prisma.company.update({ where: { id: companyId }, data: { simSettings: valid } });
  return { ok: true };
}
