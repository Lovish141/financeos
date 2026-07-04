// Costing engine — the single source of truth for how a product's cost and
// margin are computed. Deliberately pure (no DB, no I/O) so the exact same code
// path powers (a) real recompute when a MasterCost changes and (b) what-if
// simulation with hypothetical prices (Module 5, technical note #4).

export type LineType = "WEIGHT" | "FIXED";

/**
 * A recipe line — IDs only. Master-cost fields (name, unit, cost) are NEVER
 * copied here; they resolve live from the price book at read time via the
 * `masterInfo` map on `ComputeInput` (Master Cost — Live Reference Architecture).
 */
export interface SnapshotLine {
  masterCostId: string;
  lineType: LineType;
  quantity: number | null; // null for WEIGHT template lines (weight supplied per-product)
}

export interface TemplateSnapshot {
  version: number;
  templateName: string;
  category: string | null;
  lines: SnapshotLine[];
}

/** Live master-cost facts, resolved at read time and keyed by masterCostId. */
export interface MasterInfo {
  name: string;
  unit: string;
  type: "RAW_MATERIAL" | "COMPONENT" | "SERVICE";
  currentCost: number;
  archived: boolean;
}

/** Why a line is excluded from the total (contributes 0). */
export type AttentionReason = "archived" | "removed";

export interface CostLineResult {
  masterCostId: string;
  name: string;
  lineType: LineType;
  unit: string;
  unitCost: number; // resolved unit cost actually used (0 when excluded)
  quantity: number; // resolved quantity
  lineCost: number; // unitCost * quantity
  archived: boolean;
  needsAttention: boolean; // archived or removed — flagged in the UI, excluded from total
  attentionReason: AttentionReason | null;
}

export interface CostResult {
  totalCost: number;
  grossMarginAmount: number;
  grossMarginPct: number;
  lines: CostLineResult[];
}

export interface ComputeInput {
  sellingPrice: number;
  snapshot: TemplateSnapshot;
  /**
   * Live master-cost facts keyed by masterCostId — the single source of truth
   * for name/unit/cost/archived. A line whose id is absent (the master cost was
   * deleted) or whose master is archived contributes 0 and is flagged as
   * needing attention. There is no snapshotted fallback: nothing is stale.
   */
  masterInfo: Record<string, MasterInfo>;
  /** Hypothetical unit-cost overrides (simulation). Take precedence over currentCost. */
  overrides?: Record<string, number>;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute total cost + margin for a product against a recipe snapshot, resolving
 * every line live from `masterInfo`.
 *
 * Unit-cost resolution per line: archived/removed -> 0 (flagged); otherwise
 * overrides -> live currentCost.
 */
export function computeProductCost(input: ComputeInput): CostResult {
  const { sellingPrice, snapshot, masterInfo, overrides } = input;

  const lines: CostLineResult[] = snapshot.lines.map((line) => {
    const info = masterInfo[line.masterCostId];
    const missing = !info;
    const archived = info?.archived ?? false;
    // Archived or removed cost items are excluded from the total (treated as 0)
    // and surfaced for the user to replace or remove.
    const excluded = missing || archived;

    // Every line carries its own quantity — raw materials (WEIGHT) by weight,
    // components/services (FIXED) by count. A missing quantity contributes nothing.
    const quantity = line.quantity ?? 0;
    const unitCost = excluded ? 0 : overrides?.[line.masterCostId] ?? info!.currentCost;
    const lineCost = round2(unitCost * quantity);

    return {
      masterCostId: line.masterCostId,
      name: info?.name ?? "Removed item",
      lineType: line.lineType,
      unit: info?.unit ?? "",
      unitCost,
      quantity,
      lineCost,
      archived,
      needsAttention: excluded,
      attentionReason: missing ? "removed" : archived ? "archived" : null,
    };
  });

  const totalCost = round2(lines.reduce((sum, l) => sum + l.lineCost, 0));
  const grossMarginAmount = round2(sellingPrice - totalCost);
  const grossMarginPct =
    sellingPrice > 0 ? round2((grossMarginAmount / sellingPrice) * 100) : 0;

  return { totalCost, grossMarginAmount, grossMarginPct, lines };
}

export type MarginHealth = "red" | "yellow" | "green";

export interface MarginThresholds {
  marginRedThreshold: number;
  marginYellowThreshold: number;
}

/** Company-configurable margin health flag (Module 3/4). */
export function marginHealth(
  marginPct: number,
  thresholds: MarginThresholds,
): MarginHealth {
  if (marginPct < thresholds.marginRedThreshold) return "red";
  if (marginPct < thresholds.marginYellowThreshold) return "yellow";
  return "green";
}

/** Exact per-health foreground / tint colours from the design's health() helper. */
export const HEALTH_COLOR: Record<MarginHealth, string> = {
  red: "oklch(0.55 0.14 40)",
  yellow: "oklch(0.58 0.1 65)",
  green: "oklch(0.48 0.08 168)",
};
export const HEALTH_TINT: Record<MarginHealth, string> = {
  red: "oklch(0.96 0.03 40)",
  yellow: "oklch(0.96 0.04 75)",
  green: "oklch(0.955 0.025 168)",
};

/**
 * A product's per-line component override. Same shape as a snapshot line — a
 * product with `comps` set is costed exactly like a template snapshot, but the
 * quantities (raw materials included) are edited per SKU.
 */
export type ProductComp = SnapshotLine;

// Units measured continuously accept fractional quantities (e.g. grams of brass);
// countable units default to whole numbers. Mirrors the design's `unitMeta`.
const FRACTIONAL_UNITS = new Set([
  "kg", "g", "gram", "grams", "l", "ml", "litre", "liter", "m", "metre", "meter",
  "cm", "mm", "hr", "hour", "hours", "min",
]);

/** Input `step` for a quantity field, based on the cost item's unit. */
export function qtyStepForUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase().split("/").pop()?.trim() ?? "";
  return FRACTIONAL_UNITS.has(u) ? "0.001" : "1";
}
