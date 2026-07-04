import type { CostType } from "@prisma/client";

// Pure CSV parsing + master-cost row validation. Kept DB-free and framework-free
// so it's unit-testable and reusable from the server action (Module 1).

export const WEIGHT_UNITS = ["kg", "g", "ton", "lb", "quintal"];
export const PIECE_UNITS = ["piece", "pcs", "unit", "set", "hour", "job", "litre", "sqft"];

export const TYPE_LABELS: Record<CostType, string> = {
  RAW_MATERIAL: "Raw material",
  COMPONENT: "Component",
  SERVICE: "Service",
};

const TYPE_ALIASES: Record<string, CostType> = {
  raw_material: "RAW_MATERIAL",
  "raw material": "RAW_MATERIAL",
  raw: "RAW_MATERIAL",
  component: "COMPONENT",
  service: "SERVICE",
};

export function validTypeUnit(type: CostType, unit: string): boolean {
  const u = unit.toLowerCase();
  if (type === "RAW_MATERIAL") return WEIGHT_UNITS.includes(u);
  return PIECE_UNITS.includes(u);
}

/** RFC-4180-ish CSV parser: handles quoted fields, embedded commas, CRLF, and "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

export interface ParsedCostRow {
  name: string;
  category: string | null;
  type: CostType;
  unit: string;
  currentCost: number;
}

export interface CsvParseOutcome {
  valid: ParsedCostRow[];
  errors: { line: number; error: string }[];
  fatal?: string; // header/structure problem — nothing could be processed
}

/**
 * Validate a master-cost CSV. Returns valid rows plus per-line errors (1-based,
 * including the header row) so callers can report exactly what failed — valid
 * rows still import even when others fail (Module 1 acceptance).
 */
export function parseMasterCostCsv(text: string): CsvParseOutcome {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { valid: [], errors: [], fatal: "File has no data rows. Expected a header row plus at least one data row." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iName = col("name");
  const iType = col("type");
  const iUnit = col("unit");
  const iCost = col("cost");
  const iCategory = col("category");

  if (iName < 0 || iType < 0 || iUnit < 0 || iCost < 0) {
    return { valid: [], errors: [], fatal: "Header must include: name, type, unit, cost (category optional)." };
  }

  const valid: ParsedCostRow[] = [];
  const errors: { line: number; error: string }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1; // human-friendly, header = line 1
    const cells = rows[r];
    const name = (cells[iName] ?? "").trim();
    const rawType = (cells[iType] ?? "").trim().toLowerCase();
    const unit = (cells[iUnit] ?? "").trim().toLowerCase();
    const costStr = (cells[iCost] ?? "").trim();
    const category = iCategory >= 0 ? (cells[iCategory] ?? "").trim() : "";

    if (!name) { errors.push({ line, error: "Missing name." }); continue; }
    const type = TYPE_ALIASES[rawType];
    if (!type) { errors.push({ line, error: `Invalid type "${rawType}". Use raw_material, component, or service.` }); continue; }
    if (!unit) { errors.push({ line, error: "Missing unit." }); continue; }
    if (!validTypeUnit(type, unit)) {
      errors.push({ line, error: `Unit "${unit}" isn't valid for ${TYPE_LABELS[type]}.` });
      continue;
    }
    const cost = Number(costStr);
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push({ line, error: `Invalid cost "${costStr}".` });
      continue;
    }
    valid.push({ name, category: category || null, type, unit, currentCost: cost });
  }

  return { valid, errors };
}
