// Costing engine — the single source of truth for how a product's cost and
// margin are computed. Deliberately pure (no DB, no I/O) so the exact same code
// path powers (a) real recompute when a MasterCost changes and (b) what-if
// simulation with hypothetical prices (Module 5, technical note #4).

export type LineType = "WEIGHT" | "FIXED";

export interface SnapshotLine {
  masterCostId: string;
  name: string;
  lineType: LineType;
  unit: string;
  quantity: number | null; // null for WEIGHT lines
  unitCostAtSnapshot: number;
}

export interface TemplateSnapshot {
  version: number;
  templateName: string;
  category: string | null;
  lines: SnapshotLine[];
}

export interface CostLineResult {
  masterCostId: string;
  name: string;
  lineType: LineType;
  unit: string;
  unitCost: number; // resolved unit cost actually used
  quantity: number; // resolved quantity
  lineCost: number; // unitCost * quantity
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
   * Live unit costs keyed by masterCostId. A line whose id is absent falls back
   * to `unitCostAtSnapshot` — either because the id no longer resolves (the
   * master cost was deleted) or because liveCosts is omitted entirely to
   * reproduce the "cost as of creation".
   *
   * Note: archiving a master cost does NOT drop it from liveCosts. An archived
   * cost still contributes its current price, so archiving is a catalog-only
   * soft-hide and never silently re-costs a product (cost only moves on a price
   * edit, which writes a CostHistory row).
   */
  liveCosts?: Record<string, number>;
  /** Hypothetical overrides (simulation). Take precedence over liveCosts. */
  overrides?: Record<string, number>;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute total cost + margin for a product against a template snapshot.
 *
 * Unit-cost resolution order per line: overrides -> liveCosts -> snapshot value.
 * Pass no liveCosts/overrides to reproduce the "cost as of creation".
 */
export function computeProductCost(input: ComputeInput): CostResult {
  const { sellingPrice, snapshot, liveCosts, overrides } = input;

  const lines: CostLineResult[] = snapshot.lines.map((line) => {
    const unitCost =
      overrides?.[line.masterCostId] ??
      liveCosts?.[line.masterCostId] ??
      line.unitCostAtSnapshot;

    // Every line carries its own quantity — raw materials (WEIGHT) by weight,
    // components/services (FIXED) by count. A missing quantity contributes nothing.
    const quantity = line.quantity ?? 0;
    const lineCost = round2(unitCost * quantity);

    return {
      masterCostId: line.masterCostId,
      name: line.name,
      lineType: line.lineType,
      unit: line.unit,
      unitCost,
      quantity,
      lineCost,
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
