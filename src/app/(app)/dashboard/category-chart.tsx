// Custom CSS bar chart matching the FinanceOS design: fixed 0–65 axis, gridlines,
// a dashed margin-at-risk threshold line, and per-category bars coloured by health.
// No interactivity, so this stays a server component (bars animate via CSS).

import { formatPercent } from "@/lib/utils";

type Row = { category: string; margin: number; count: number; color: string };

const CATMAX = 65;

export function CategoryChart({
  data,
  thr,
  skuCount,
}: {
  data: Row[];
  thr: number;
  skuCount: number;
}) {
  const thrTop = `${((1 - thr / CATMAX) * 100).toFixed(1)}%`;

  return (
    <div className="card" style={{ padding: "20px 24px 18px" }}>
      <div className="mb-6 flex items-center justify-between">
        <span className="text-base font-bold tracking-[-0.01em] text-ink-900">
          Average margin by category
        </span>
        <span className="font-mono text-[10.5px]" style={{ color: "oklch(0.55 0.01 260)" }}>
          {data.length} categories · {skuCount} SKUs
        </span>
      </div>

      {data.length === 0 ? (
        <div className="flex h-60 items-center justify-center text-sm text-ink-400">
          No category data yet.
        </div>
      ) : (
        <div className="flex gap-3.5" style={{ height: 240 }}>
          {/* y-axis */}
          <div
            className="flex w-7 flex-col justify-between pb-7 text-right font-mono text-[10.5px]"
            style={{ color: "oklch(0.6 0.01 260)" }}
          >
            <span>65</span>
            <span>48</span>
            <span>32</span>
            <span>16</span>
            <span>0</span>
          </div>

          <div className="relative flex-1">
            {/* gridlines + threshold */}
            <div className="absolute left-0 right-0 top-0" style={{ bottom: 28 }}>
              {[0, 25, 50, 75].map((t) => (
                <div
                  key={t}
                  className="absolute left-0 right-0"
                  style={{ top: `${t}%`, borderTop: "1px solid oklch(0.94 0.003 250)" }}
                />
              ))}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ borderTop: "1px solid oklch(0.88 0.005 250)" }}
              />
              <div
                className="absolute left-0 right-0"
                style={{ top: thrTop, borderTop: "1.5px dashed oklch(0.62 0.12 40)" }}
              />
              <div
                className="absolute font-mono text-[9.5px]"
                style={{
                  right: 2,
                  top: thrTop,
                  transform: "translateY(-115%)",
                  color: "oklch(0.55 0.12 40)",
                  background: "#fff",
                  padding: "0 5px",
                }}
              >
                RISK {thr}%
              </div>
            </div>

            {/* bars */}
            <div className="absolute inset-0 flex items-end" style={{ gap: 34, padding: "0 20px 28px" }}>
              {data.map((c) => (
                <div key={c.category} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="mb-[7px] max-w-full truncate font-mono text-[13px] font-semibold" style={{ color: c.color }} title={formatPercent(c.margin)}>
                    {formatPercent(c.margin)}
                  </div>
                  <div
                    className="animate-bar-rise w-full origin-bottom"
                    style={{
                      maxWidth: 110,
                      height: `${Math.min(100, Math.max(0, (c.margin / CATMAX) * 100)).toFixed(1)}%`,
                      background: `linear-gradient(180deg, ${c.color}, ${c.color.replace(")", " / 0.72)")})`,
                      borderRadius: "7px 7px 0 0",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* x-axis labels */}
            <div className="absolute bottom-0 left-0 right-0 flex" style={{ gap: 34, padding: "0 20px" }}>
              {data.map((c) => (
                <div
                  key={c.category}
                  className="min-w-0 flex-1 text-center text-[13px] font-semibold"
                  style={{ color: "oklch(0.35 0.01 260)" }}
                >
                  <span className="block truncate" title={c.category}>{c.category}</span>
                  <span
                    className="mt-0.5 block font-mono text-[10px] font-normal"
                    style={{ color: "oklch(0.6 0.01 260)" }}
                  >
                    {c.count} SKU
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
