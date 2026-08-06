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
  /**
   * "% of sales" lines only: the per-product percentage of the selling price to
   * apply (e.g. 5 = 5%). Lets a product override the master cost's shared rate.
   * Absent/null → fall back to the master cost's live rate (legacy lines + the
   * default when the user hasn't changed it).
   */
  percent?: number | null;
  /**
   * Every other line: the per-product per-unit rate to apply (e.g. 520 = ₹520/kg
   * on a raw material, ₹12/piece on a component). Lets a product price an item
   * differently from the master cost's shared rate for this SKU. Absent/null →
   * fall back to the master cost's live rate (legacy lines + the default when
   * the user leaves it blank).
   */
  rate?: number | null;
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
  /**
   * True when `quantity` was derived from the product's raw-material weight
   * (a weight-priced service) rather than stored on the line. The UI shows it
   * read-only, since there is nothing for the user to type.
   */
  quantityFromWeight: boolean;
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
 * Canonical unit for a cost expressed as a percentage of the product's selling
 * price (e.g. a sales commission or royalty) rather than a flat per-unit amount.
 * The master cost's `currentCost` holds the percentage value (5 = 5%).
 */
export const PERCENT_OF_SALES_UNIT = "% of sales";

/** True when a cost line is a percentage of the selling price. Matched loosely
 *  so minor label variants ("% of sale", "percent of sales") all count. */
export function isPercentOfSalesUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return u === "% of sales" || u === "% of sale" || u === "percent of sales";
}

/**
 * Weight units the app understands, as kilograms per 1 unit. Anything not listed
 * (piece, hour, m…) is not a weight and bills by its own count.
 */
const WEIGHT_UNITS_IN_KG: Record<string, number> = {
  kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogram: 1, kilograms: 1,
  g: 0.001, gm: 0.001, gms: 0.001, gram: 0.001, grams: 0.001,
  mg: 0.000001,
  t: 1000, ton: 1000, tons: 1000, tonne: 1000, tonnes: 1000,
  lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592,
  oz: 0.0283495,
};

/**
 * Kilograms in one of `unit`, or null when `unit` isn't a weight. Lets a recipe
 * mix weight units (brass in kg, a spring in g) and still add up.
 */
export function weightUnitInKg(unit: string | null | undefined): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  return WEIGHT_UNITS_IN_KG[u] ?? null;
}

/** True when a cost item is priced by weight (₹/kg, ₹/g, …). */
export function isWeightUnit(unit: string | null | undefined): boolean {
  return weightUnitInKg(unit) !== null;
}

/**
 * True when a line bills against the product's raw-material weight rather than a
 * quantity of its own: a **service priced by weight** (plating, polishing,
 * freight at ₹/kg). Its quantity is the product's weight, so it is derived, not
 * typed — nobody should have to restate the weight on every such line.
 *
 * Only SERVICE qualifies. A RAW_MATERIAL or COMPONENT priced by weight *is*
 * material: it contributes its own weight, supplied per product.
 */
export function isWeightBilledService(
  type: MasterInfo["type"] | string | null | undefined,
  unit: string | null | undefined,
): boolean {
  return type === "SERVICE" && isWeightUnit(unit);
}

/**
 * The product's raw-material weight in kg — what weight-billed services charge
 * against. Sums the weight-priced RAW_MATERIAL lines; archived/removed ones
 * contribute no cost, so they contribute no weight either.
 */
export function rawMaterialWeightKg(
  lines: Pick<SnapshotLine, "masterCostId" | "quantity">[],
  masterInfo: Record<string, MasterInfo>,
): number {
  return lines.reduce((sum, line) => {
    const info = masterInfo[line.masterCostId];
    if (!info || info.archived || info.type !== "RAW_MATERIAL") return sum;
    const kgPerUnit = weightUnitInKg(info.unit);
    return kgPerUnit === null ? sum : sum + (line.quantity ?? 0) * kgPerUnit;
  }, 0);
}

/**
 * Compute total cost + margin for a product against a recipe snapshot, resolving
 * every line live from `masterInfo`.
 *
 * Unit-cost resolution per line: archived/removed -> 0 (flagged); otherwise the
 * product's own percent/rate -> simulation override -> live currentCost.
 */
export function computeProductCost(input: ComputeInput): CostResult {
  const { sellingPrice, snapshot, masterInfo, overrides } = input;

  // Resolved once for the whole recipe: weight-billed service lines all charge
  // against the same raw-material weight.
  const weightKg = rawMaterialWeightKg(snapshot.lines, masterInfo);

  const lines: CostLineResult[] = snapshot.lines.map((line) => {
    const info = masterInfo[line.masterCostId];
    const missing = !info;
    const archived = info?.archived ?? false;
    // Archived or removed cost items are excluded from the total (treated as 0)
    // and surfaced for the user to replace or remove.
    const excluded = missing || archived;

    // The resolved value: live currentCost, or a hypothetical override (simulation).
    // For a "% of sales" line this is a percentage; otherwise a flat unit amount.
    const resolved = excluded ? 0 : overrides?.[line.masterCostId] ?? info!.currentCost;

    // How a line prices is decided by the master cost's UNIT, not its CostType —
    // any cost item may carry any unit. There are exactly two families:
    //
    //   "% of sales"  → a percentage of the product's selling price, applied once.
    //   anything else → rate × quantity ("kg", "piece", "hour", …), where the rate
    //                   is a per-unit amount (₹/kg for a raw material, ₹/piece for
    //                   a component — same arithmetic either way).
    //
    // Both the percentage and the rate may be overridden per product; blank falls
    // back to the master cost's live value, so the line keeps tracking the price
    // book. An excluded (archived/removed) line contributes 0 regardless of any
    // override the product pinned.
    const percentOfSales = !excluded && isPercentOfSalesUnit(info!.unit);
    const percent = excluded ? 0 : line.percent ?? resolved;
    const rate = excluded ? 0 : line.rate ?? resolved;

    // A service priced by weight bills the product's raw-material weight, not a
    // count of its own — converted into the service's unit, so ₹/g and ₹/kg both
    // work against materials measured either way. Any stored quantity is ignored.
    const weightBilled = !excluded && isWeightBilledService(info!.type, info!.unit);
    const derivedQuantity = weightBilled ? weightKg / weightUnitInKg(info!.unit)! : 0;

    // A "% of sales" line is NOT a count × amount line: the percentage applies to
    // the selling price exactly once, so its quantity is pinned to 1 (any stored
    // count is ignored — older recipes must not multiply it). Every other line
    // carries its own quantity; a missing quantity contributes nothing.
    const quantity = percentOfSales ? 1 : weightBilled ? derivedQuantity : line.quantity ?? 0;
    const unitCost = percentOfSales ? round2((percent / 100) * sellingPrice) : rate;
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
      quantityFromWeight: weightBilled,
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
