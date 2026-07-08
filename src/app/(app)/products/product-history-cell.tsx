"use client";

import { History } from "lucide-react";
import { openProductHistory } from "./product-drawers";

/**
 * Products table history column: a compact cost sparkline over the product's
 * recent revisions that opens the full revision drawer on click. Mirrors the
 * master-cost `CostHistoryCell`. Shows a muted placeholder when a product has no
 * revisions yet (e.g. created before the feature existed).
 */
export function ProductHistoryCell({
  id,
  points,
  count,
}: {
  id: string;
  points: number[]; // oldest → newest
  count: number;
}) {
  if (count === 0 || points.length === 0) {
    return (
      <button
        type="button"
        onClick={() => openProductHistory(id)}
        className="mx-auto flex h-7 items-center justify-center rounded-md px-2 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-500"
        title="No revisions yet"
      >
        <History className="h-[15px] w-[15px]" strokeWidth={1.9} />
      </button>
    );
  }

  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const rng = hi - lo || 1;
  const up = points.length > 1 && points[points.length - 1] > points[0];
  const flat = points.length > 1 && points[points.length - 1] === points[0];
  const last = flat ? "oklch(0.6 0.02 260)" : up ? "oklch(0.55 0.14 40)" : "oklch(0.5 0.09 168)";

  return (
    <button
      type="button"
      onClick={() => openProductHistory(id)}
      className="mx-auto flex h-7 items-end justify-center gap-[3px] rounded-md px-2 transition-colors hover:bg-ink-100"
      title={`${count} revision${count === 1 ? "" : "s"} — view history`}
    >
      {points.map((v, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: `${(8 + ((v - lo) / rng) * 18).toFixed(0)}px`,
            borderRadius: 2,
            background: i === points.length - 1 ? last : "oklch(0.78 0.02 260)",
          }}
        />
      ))}
    </button>
  );
}
