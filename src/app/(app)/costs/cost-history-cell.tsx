"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/utils";
import { openCostPreview } from "./cost-drawer";

export interface HistoryPoint {
  label: string; // relative time, e.g. "3 mo ago"
  value: number; // price at this point
  delta: number | null; // change vs previous entry; null when first-ever
  first: boolean; // genuinely the first price on record
}

const RUST = "oklch(0.55 0.14 40)";
const DOT = "oklch(0.68 0.04 168)";

/**
 * History column cell: a compact sparkline of the latest price points that
 * reveals a "Price history" popover on hover and opens the item's preview
 * (full timeline) on click. Rendered via portal so the table card's
 * overflow-hidden doesn't clip the popover.
 */
export function CostHistoryCell({
  id,
  currency,
  dot,
  points,
}: {
  id: string;
  currency: string;
  dot: string;
  points: HistoryPoint[];
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rng = hi - lo || 1;

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: r.left + r.width / 2 });
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => openCostPreview(id)}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        className="mx-auto flex h-7 items-end justify-center gap-[3px] rounded-md px-2 transition-colors hover:bg-ink-100"
        title="View price history"
      >
        {points.map((p, i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: `${(8 + ((p.value - lo) / rng) * 20).toFixed(0)}px`,
              borderRadius: 2,
              background: i === points.length - 1 ? dot : "oklch(0.72 0.04 175)",
            }}
          />
        ))}
      </button>

      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60]"
            style={{ top: pos.top - 10, left: pos.left, transform: "translate(-50%, -100%)" }}
          >
            <div className="card animate-pop shadow-elevated" style={{ width: 248, padding: "16px 18px" }}>
              <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-400">
                Price history
              </div>
              <div className="flex flex-col gap-3.5">
                {points.map((p, i) => (
                  <div
                    key={i}
                    className="grid items-center gap-2.5"
                    style={{ gridTemplateColumns: "10px 1fr auto 46px" }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT }} />
                    <span className="font-mono text-[12.5px] text-ink-500">{p.label}</span>
                    <span className="text-right font-mono text-[15px] font-bold tracking-[-0.01em] text-ink-900">
                      {formatMoney(p.value, currency)}
                    </span>
                    {p.first ? (
                      <span className="text-right font-mono text-[11px] leading-tight text-ink-400">
                        first seen
                      </span>
                    ) : (
                      <span
                        className="text-right font-mono text-[11px] font-semibold"
                        style={{ color: p.delta! >= 0 ? RUST : DOT }}
                      >
                        {p.delta! >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(p.delta!), currency)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
