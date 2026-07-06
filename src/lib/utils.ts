import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Above this magnitude a money value has too many digits to fit its cell, so we
// fall back to scientific notation (e.g. ₹1.2E19) rather than overflow the card.
const MONEY_SCI_THRESHOLD = 1e12;
// Percentages are unbounded (a near-zero price yields astronomically negative
// margins); switch to scientific well before the digit count breaks layout.
const PERCENT_SCI_THRESHOLD = 1e9;

export function formatCurrency(value: number, currency = "INR"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...(Math.abs(value) >= MONEY_SCI_THRESHOLD ? { notation: "scientific", maximumFractionDigits: 1 } : {}),
  }).format(value);
}

/** Whole-rupee money for dashboards (design shows no decimals, e.g. ₹1,850). */
export function formatMoney(value: number, currency = "INR"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...(Math.abs(value) >= MONEY_SCI_THRESHOLD ? { notation: "scientific", maximumFractionDigits: 1 } : {}),
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= PERCENT_SCI_THRESHOLD) {
    return `${new Intl.NumberFormat("en-US", { notation: "scientific", maximumFractionDigits: 1 }).format(value)}%`;
  }
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function daysSince(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** Compact relative time for price-history labels, e.g. "now", "5 d ago", "3 mo ago". */
export function formatRelativeShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(mo / 12)} y ago`;
}

/**
 * Stable colour for a category name — a 6-entry palette cycled by a hash of the
 * name (design: blue 250 / violet 300 / orange 45 / teal 162 / red 20 / olive 100).
 * A null/empty category gets a neutral gray.
 */
const CATEGORY_HUES = [250, 300, 45, 162, 20, 100];

export function categoryColor(name: string | null | undefined): { color: string; bg: string; dot: string } {
  if (!name || !name.trim()) {
    return { color: "oklch(0.5 0.01 260)", bg: "oklch(0.96 0.004 260)", dot: "oklch(0.6 0.01 260)" };
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = CATEGORY_HUES[h % CATEGORY_HUES.length];
  return {
    color: `oklch(0.48 0.1 ${hue})`,
    bg: `oklch(0.96 0.03 ${hue})`,
    dot: `oklch(0.55 0.12 ${hue})`,
  };
}

/** slugify a name into an uppercase SKU-ish token */
export function toSkuToken(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
}
