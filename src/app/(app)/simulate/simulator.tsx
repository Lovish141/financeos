"use client";

import { useActionState, useMemo, useState } from "react";
import { FlaskConical, ArrowRight, AlertTriangle, TrendingDown } from "lucide-react";
import { runSimulation, type SimResult } from "@/server/actions/simulate-actions";
import { formatMoney, formatPercent } from "@/lib/utils";
import { HEALTH_COLOR } from "@/lib/costing";

type MasterCost = { id: string; name: string; type: string; unit: string; currentCost: number };

const RISK = "oklch(0.55 0.14 40)";
const GREEN = "oklch(0.48 0.08 168)";
const MUTED = "oklch(0.62 0.02 260)";

export function Simulator({ masterCosts, currency }: { masterCosts: MasterCost[]; currency: string }) {
  const [result, action, pending] = useActionState<SimResult | undefined, FormData>(runSimulation, undefined);
  const [selectedId, setSelectedId] = useState(masterCosts[0]?.id ?? "");
  const selected = useMemo(() => masterCosts.find((m) => m.id === selectedId), [masterCosts, selectedId]);
  const current = selected?.currentCost ?? 0;
  const [newPrice, setNewPrice] = useState<number>(current);

  const maxPrice = Math.max(Math.ceil(current * 2), current + 100, 10);
  const step = current > 200 ? 5 : current > 20 ? 1 : 0.5;
  const deltaPct = current > 0 ? ((newPrice - current) / current) * 100 : 0;
  const up = newPrice > current;
  const flat = Math.abs(newPrice - current) < 1e-6;
  const deltaColor = flat ? MUTED : up ? RISK : GREEN;
  const fillPct = Math.min(100, (newPrice / maxPrice) * 100);

  function pick(id: string) {
    setSelectedId(id);
    const mc = masterCosts.find((m) => m.id === id);
    if (mc) setNewPrice(mc.currentCost);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Dark control card */}
      <form action={action} className="h-fit rounded-2xl p-[22px] text-white shadow-card" style={{ background: "oklch(0.23 0.02 262)" }}>
        <input type="hidden" name="masterCostId" value={selectedId} />
        <input type="hidden" name="newPrice" value={newPrice} />

        <div className="mb-4 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: "oklch(0.72 0.02 260)" }}>
          <FlaskConical className="h-[15px] w-[15px]" strokeWidth={2} /> What-if control
        </div>

        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "oklch(0.68 0.02 260)" }}>
          Cost item
        </label>
        <select
          value={selectedId}
          onChange={(e) => pick(e.target.value)}
          className="mb-5 w-full cursor-pointer appearance-none rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-white outline-none"
          style={{ background: "oklch(0.3 0.02 262)", border: "1px solid oklch(0.4 0.02 262)" }}
        >
          {masterCosts.map((m) => (
            <option key={m.id} value={m.id} style={{ color: "black" }}>
              {m.name} · {formatMoney(m.currentCost, currency)}/{m.unit}
            </option>
          ))}
        </select>

        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "oklch(0.68 0.02 260)" }}>
          Hypothetical price
        </div>
        <div className="flex items-end justify-between">
          <div className="font-mono text-[30px] font-bold leading-none tracking-[-0.02em]">{formatMoney(newPrice, currency)}</div>
          <span className="rounded-full px-2 py-0.5 font-mono text-[12px] font-semibold" style={{ color: deltaColor, background: "oklch(1 0 0 / 0.08)" }}>
            {flat ? "±0%" : `${up ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}%`}
          </span>
        </div>
        <div className="mt-1 font-mono text-[11.5px]" style={{ color: "oklch(0.6 0.02 260)" }}>
          from {formatMoney(current, currency)}{selected ? ` / ${selected.unit}` : ""}
        </div>

        <input
          type="range"
          min={0}
          max={maxPrice}
          step={step}
          value={newPrice}
          onChange={(e) => setNewPrice(Number(e.target.value))}
          className="sim-slider mt-4 w-full"
          style={{ background: `linear-gradient(90deg, ${up ? RISK : GREEN} ${fillPct}%, oklch(0.36 0.02 262) ${fillPct}%)` }}
        />

        <div className="mt-1.5 flex justify-between font-mono text-[10px]" style={{ color: "oklch(0.55 0.02 260)" }}>
          <span>{formatMoney(0, currency)}</span>
          <span>{formatMoney(maxPrice, currency)}</span>
        </div>

        <button
          type="submit"
          disabled={pending || !selectedId}
          className="mt-5 w-full rounded-xl bg-white py-[11px] text-[13.5px] font-bold text-ink-900 transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Simulating…" : "Run simulation"}
        </button>
        <p className="mt-3 text-center font-mono text-[10px]" style={{ color: "oklch(0.55 0.02 260)" }}>
          Read-only · nothing is saved
        </p>
      </form>

      {/* Results */}
      <div>
        {result?.error && (
          <div className="card p-5 text-[13.5px] text-risk-500">{result.error}</div>
        )}

        {result?.ok && (
          <div className="animate-fade-up space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Affected products"
                value={String(result.affectedCount)}
                sub={
                  <>
                    {result.masterCostName} {formatMoney(result.currentPrice!, currency)} <ArrowRight className="inline h-3 w-3" /> {formatMoney(result.newPrice!, currency)}
                  </>
                }
              />
              <KpiCard
                label="Would go negative"
                value={String(result.goingNegative)}
                valueColor={result.goingNegative ? RISK : GREEN}
                icon={<AlertTriangle className="h-[15px] w-[15px]" />}
              />
              <KpiCard
                label="Input price move"
                value={result.currentPrice ? formatPercent(((result.newPrice! - result.currentPrice) / result.currentPrice) * 100) : "—"}
                valueColor={result.newPrice! > result.currentPrice! ? RISK : result.newPrice! < result.currentPrice! ? GREEN : undefined}
                icon={<TrendingDown className="h-[15px] w-[15px]" />}
              />
            </div>

            {result.affectedCount === 0 ? (
              <div className="card p-5 text-[13.5px] text-ink-500">No products use this cost item, so nothing is affected.</div>
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="border-b border-[var(--border)] px-[22px] py-[15px]">
                  <h3 className="text-[14px] font-bold text-ink-900">Impact — before vs after</h3>
                  <p className="mt-0.5 text-[12.5px] text-ink-500">Ranked by size of margin impact.</p>
                </div>
                <div
                  className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
                  style={{ gridTemplateColumns: "1.8fr 1.1fr 1.1fr 1.3fr 0.9fr" }}
                >
                  <span>Product</span>
                  <span className="text-right">Cost</span>
                  <span className="text-right">Margin</span>
                  <span className="text-right">Margin % after</span>
                  <span className="text-right">Δ</span>
                </div>
                {result.impacts!.map((im) => {
                  const color = HEALTH_COLOR[im.afterHealth];
                  const barW = `${Math.min(100, (Math.max(0, im.afterMarginPct) / 70) * 100).toFixed(0)}%`;
                  const dColor = im.deltaMarginAmount < 0 ? RISK : im.deltaMarginAmount > 0 ? GREEN : MUTED;
                  return (
                    <div
                      key={im.productId}
                      className="grid items-center gap-3 border-b border-[var(--border)] px-[22px] py-[14px] last:border-0 hover:bg-ink-50/60"
                      style={{ gridTemplateColumns: "1.8fr 1.1fr 1.1fr 1.3fr 0.9fr", background: im.afterMarginAmount < 0 ? "oklch(0.97 0.02 40)" : undefined }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-ink-900">{im.name}</div>
                        <div className="font-mono text-[10.5px] text-ink-400">
                          {im.sku}
                          {im.goesNegative && <span className="ml-1 font-semibold" style={{ color: RISK }}>· turns negative</span>}
                        </div>
                      </div>
                      <div className="text-right font-mono text-[12.5px]">
                        <span className="text-ink-400">{formatMoney(im.beforeCost, currency)}</span>
                        <span className="mx-0.5 text-ink-300">→</span>
                        <span className="font-semibold text-ink-900">{formatMoney(im.afterCost, currency)}</span>
                      </div>
                      <div className="text-right font-mono text-[12.5px]">
                        <span className="text-ink-400">{formatMoney(im.beforeMarginAmount, currency)}</span>
                        <span className="mx-0.5 text-ink-300">→</span>
                        <span className="font-semibold" style={{ color: im.afterMarginAmount < 0 ? RISK : "oklch(0.25 0.01 260)" }}>{formatMoney(im.afterMarginAmount, currency)}</span>
                      </div>
                      <div className="flex flex-col items-end gap-[5px]">
                        <span className="font-mono text-[13px] font-bold" style={{ color }}>{formatPercent(im.afterMarginPct)}</span>
                        <div style={{ width: 100, height: 5, borderRadius: 4, background: "oklch(0.94 0.004 250)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: barW, background: color, borderRadius: 4 }} />
                        </div>
                      </div>
                      <div className="text-right font-mono text-[12.5px] font-semibold" style={{ color: dColor }}>
                        {im.deltaMarginAmount > 0 ? "+" : im.deltaMarginAmount < 0 ? "−" : "±"}
                        {formatMoney(Math.abs(im.deltaMarginAmount), currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!result && (
          <div className="card flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-300 ring-1 ring-ink-100">
              <FlaskConical className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[15px] font-bold text-ink-900">Model a price change</div>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-400">
                Drag the slider to a hypothetical input price and run the simulation to see every affected SKU’s new margin.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">
        {icon && <span className="text-ink-400">{icon}</span>}
        {label}
      </div>
      <div className="mt-2.5 text-[1.65rem] font-extrabold tracking-[-0.03em]" style={{ color: valueColor ?? "oklch(0.22 0.01 260)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 truncate font-mono text-[11px] text-ink-400">{sub}</div>}
    </div>
  );
}
