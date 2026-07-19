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
    // A blank required cost is an omission, not a ₹0 cost — reject rather than
    // silently recording zero. An explicit "0" is still allowed.
    if (!costStr) { errors.push({ line, error: "Missing cost." }); continue; }
    const cost = Number(costStr);
    if (!Number.isFinite(cost) || cost < 0) {
      errors.push({ line, error: `Invalid cost "${costStr}".` });
      continue;
    }
    valid.push({ name, category: category || null, type, unit, currentCost: cost });
  }

  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Sales CSV (Module 8) — bulk sale transactions. Mirrors the master-cost parser:
// DB-free and framework-free so it's unit-testable and reusable from the action.
// ---------------------------------------------------------------------------

export const SALES_CHANNELS = ["RETAIL", "WHOLESALE", "DISTRIBUTOR", "EXPORT", "ONLINE", "OTHER"] as const;
export type SalesChannelValue = (typeof SALES_CHANNELS)[number];

const CHANNEL_ALIASES: Record<string, SalesChannelValue> = {
  retail: "RETAIL",
  wholesale: "WHOLESALE",
  distributor: "DISTRIBUTOR",
  export: "EXPORT",
  online: "ONLINE",
  ecommerce: "ONLINE",
  "e-commerce": "ONLINE",
  other: "OTHER",
};

/** Parse a channel string to an enum value, or null if empty/unrecognised-but-optional. */
export function parseChannel(raw: string): SalesChannelValue | null | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return CHANNEL_ALIASES[v]; // undefined => invalid
}

export interface ParsedSaleRow {
  line: number; // 1-based source line (header = line 1) for accurate reporting
  invoice: string | null; // optional group key — rows sharing one become one order
  sku: string;
  quantity: number;
  unitPrice: number;
  soldAt: Date;
  channel: SalesChannelValue | null;
  customer: string | null;
}

export interface SalesCsvOutcome {
  valid: ParsedSaleRow[];
  errors: { line: number; error: string }[];
  fatal?: string;
}

/**
 * A recorded sale can't have happened in the future — this module is explicitly
 * "Realized Transactions". A 24h grace absorbs timezone skew (a user ahead of UTC
 * entering "today" as local midnight resolves to a UTC instant slightly ahead of
 * the server clock) while still rejecting genuinely future dates.
 */
export function isFutureDate(d: Date, now: Date = new Date()): boolean {
  return d.getTime() > now.getTime() + 24 * 60 * 60 * 1000;
}

/** Parse a date cell — accepts YYYY-MM-DD, YYYY/MM/DD, or DD-MM-YYYY / DD/MM/YYYY. */
export function parseSaleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO-ish: 2026-07-08 or 2026/07/08
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Day-first: 08-07-2026 or 08/07/2026
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Validate a sales CSV. Returns valid rows (by SKU — resolved to product ids in
 * the action) plus per-line errors (1-based, header = line 1). Valid rows still
 * import even when others fail (mirrors Module 1 acceptance).
 */
export function parseSalesCsv(text: string, now: Date = new Date()): SalesCsvOutcome {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { valid: [], errors: [], fatal: "File has no data rows. Expected a header row plus at least one data row." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iSku = col("sku");
  const iQty = col("quantity", "qty", "units");
  const iDate = col("date", "sold_at", "soldat");
  const iPrice = col("unit_price", "unitprice", "price");
  const iChannel = col("channel");
  const iCustomer = col("customer", "account");
  const iInvoice = col("invoice", "invoice_no", "invoice_id", "order", "order_id");

  if (iSku < 0 || iQty < 0 || iDate < 0 || iPrice < 0) {
    return { valid: [], errors: [], fatal: "Header must include: sku, quantity, date, unit_price (channel, customer optional)." };
  }

  const valid: ParsedSaleRow[] = [];
  const errors: { line: number; error: string }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r];
    const sku = (cells[iSku] ?? "").trim();
    const qtyStr = (cells[iQty] ?? "").trim();
    const dateStr = (cells[iDate] ?? "").trim();
    const priceStr = (cells[iPrice] ?? "").trim();
    const channelStr = iChannel >= 0 ? (cells[iChannel] ?? "").trim() : "";
    const customer = iCustomer >= 0 ? (cells[iCustomer] ?? "").trim() : "";
    const invoice = iInvoice >= 0 ? (cells[iInvoice] ?? "").trim() : "";

    if (!sku) { errors.push({ line, error: "Missing SKU." }); continue; }
    if (!qtyStr) { errors.push({ line, error: "Missing quantity." }); continue; }
    const quantity = Number(qtyStr);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ line, error: `Invalid quantity "${qtyStr}".` });
      continue;
    }
    // A blank unit_price is a required-field omission, not a ₹0 sale — reject it
    // rather than silently recording zero revenue. An explicit "0" is still allowed.
    if (!priceStr) { errors.push({ line, error: "Missing unit price." }); continue; }
    const unitPrice = Number(priceStr);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push({ line, error: `Invalid unit price "${priceStr}".` });
      continue;
    }
    if (!dateStr) { errors.push({ line, error: "Missing date." }); continue; }
    const soldAt = parseSaleDate(dateStr);
    if (!soldAt) { errors.push({ line, error: `Invalid date "${dateStr}". Use YYYY-MM-DD.` }); continue; }
    if (isFutureDate(soldAt, now)) {
      errors.push({ line, error: `Date "${dateStr}" is in the future — sales must be realized (past-dated).` });
      continue;
    }
    const channel = parseChannel(channelStr);
    if (channel === undefined) {
      errors.push({ line, error: `Invalid channel "${channelStr}". Use retail, wholesale, distributor, export, online, or other.` });
      continue;
    }

    valid.push({ line, invoice: invoice || null, sku, quantity, unitPrice, soldAt, channel, customer: customer || null });
  }

  return { valid, errors };
}
