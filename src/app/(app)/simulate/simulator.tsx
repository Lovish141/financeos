"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  FlaskConical,
  ArrowRight,
  Search,
  RotateCcw,
  Check,
  Save,
} from "lucide-react";
import { runSimulation, saveSimSettings, type SimResult } from "@/server/actions/simulate-actions";
import { formatMoney, formatPercent } from "@/lib/utils";
import { HEALTH_COLOR } from "@/lib/costing";

type MasterCost = { id: string; name: string; type: string; unit: string; currentCost: number };

const RISK = "oklch(0.55 0.14 40)";
const GREEN = "oklch(0.48 0.08 168)";
const MUTED = "oklch(0.62 0.02 260)";

// Per-input slider bounds derived from the live base price. Isolated so a future
// simulation parameter (a non-price input) only needs to supply its own rule.
function bounds(current: number) {
  const max = Math.max(Math.ceil(current * 2), current + 100, 10);
  const step = current > 200 ? 5 : current > 20 ? 1 : 0.5;
  return { max, step };
}

export function Simulator({
  masterCosts,
  currency,
  savedIds,
  canSave,
}: {
  masterCosts: MasterCost[];
  currency: string;
  savedIds: string[];
  canSave: boolean;
}) {
  const [result, action, pending] = useActionState<SimResult | undefined, FormData>(runSimulation, undefined);

  const byId = useMemo(() => new Map(masterCosts.map((m) => [m.id, m])), [masterCosts]);

  // Selection order is preserved. Seed from the persisted preset, else the first item.
  const initialIds = savedIds.length ? savedIds : masterCosts[0] ? [masterCosts[0].id] : [];
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  // Hypothetical value per selected id — never persisted; always starts at base.
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialIds.map((id) => [id, byId.get(id)?.currentCost ?? 0])),
  );
  const [query, setQuery] = useState("");

  const [savePending, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return masterCosts;
    return masterCosts.filter((m) => m.name.toLowerCase().includes(q) || m.unit.toLowerCase().includes(q));
  }, [masterCosts, query]);

  function toggle(id: string) {
    setSaveMsg(null);
    setSaved(false);
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      setValues((v) => (id in v ? v : { ...v, [id]: byId.get(id)?.currentCost ?? 0 }));
      return [...prev, id];
    });
  }

  function setValue(id: string, next: number) {
    setValues((v) => ({ ...v, [id]: next }));
  }
  function reset(id: string) {
    setValue(id, byId.get(id)?.currentCost ?? 0);
  }

  const inputsJson = JSON.stringify(selectedIds.map((id) => ({ masterCostId: id, newPrice: values[id] ?? 0 })));
  const modifiedCount = selectedIds.filter(
    (id) => Math.abs((values[id] ?? 0) - (byId.get(id)?.currentCost ?? 0)) > 1e-6,
  ).length;

  function onSave() {
    setSaveMsg(null);
    startSave(async () => {
      const r = await saveSimSettings(selectedIds);
      if (r.ok) {
        setSaved(true);
      } else {
        setSaved(false);
        setSaveMsg(r.error ?? "Could not save");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Dark control card */}
      <form action={action} className="h-fit rounded-2xl p-[22px] text-white shadow-card" style={{ background: "oklch(0.23 0.02 262)" }}>
        <input type="hidden" name="inputs" value={inputsJson} />

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: "oklch(0.72 0.02 260)" }}>
            <FlaskConical className="h-[15px] w-[15px]" strokeWidth={2} /> What-if control
          </div>
          <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ color: "oklch(0.72 0.02 260)", background: "oklch(1 0 0 / 0.08)" }}>
            {selectedIds.length} selected
          </span>
        </div>

        {/* Search */}
        <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "oklch(0.3 0.02 262)", border: "1px solid oklch(0.4 0.02 262)" }}>
          <Search className="h-[14px] w-[14px]" style={{ color: "oklch(0.6 0.02 260)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cost items…"
            className="w-full border-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
          />
        </div>

        {/* Selectable list */}
        <div className="mb-4 max-h-[190px] overflow-y-auto rounded-xl" style={{ border: "1px solid oklch(0.34 0.02 262)" }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center font-mono text-[11px]" style={{ color: "oklch(0.58 0.02 260)" }}>No matches</div>
          ) : (
            filtered.map((m) => {
              const on = selectedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.04]"
                  style={{ background: on ? "oklch(0.3 0.02 262)" : "transparent" }}
                >
                  <span
                    className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px]"
                    style={{ background: on ? "white" : "transparent", border: on ? "none" : "1px solid oklch(0.45 0.02 262)" }}
                  >
                    {on && <Check className="h-[11px] w-[11px] text-ink-900" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">{m.name}</span>
                  <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "oklch(0.62 0.02 260)" }}>
                    {formatMoney(m.currentCost, currency)}/{m.unit}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Adjustments */}
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "oklch(0.68 0.02 260)" }}>
          <span>Adjustments</span>
          {modifiedCount > 0 && <span style={{ color: "oklch(0.8 0.08 65)" }}>{modifiedCount} modified</span>}
        </div>

        {selectedIds.length === 0 ? (
          <div className="rounded-xl px-3 py-4 text-center font-mono text-[11px]" style={{ background: "oklch(0.27 0.02 262)", color: "oklch(0.6 0.02 260)" }}>
            Select cost items above to adjust their prices.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedIds.map((id) => {
              const mc = byId.get(id);
              if (!mc) return null;
              const current = mc.currentCost;
              const val = values[id] ?? current;
              const { max, step } = bounds(current);
              const deltaPct = current > 0 ? ((val - current) / current) * 100 : 0;
              const up = val > current;
              const modified = Math.abs(val - current) > 1e-6;
              const deltaColor = !modified ? MUTED : up ? RISK : GREEN;
              const fillPct = Math.min(100, (val / max) * 100);
              return (
                <div
                  key={id}
                  className="rounded-xl p-3"
                  style={{ background: "oklch(0.27 0.02 262)", border: modified ? `1px solid ${up ? RISK : GREEN}` : "1px solid oklch(0.32 0.02 262)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {modified && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: up ? RISK : GREEN }} />}
                      <span className="truncate text-[12.5px] font-semibold text-white">{mc.name}</span>
                    </div>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-semibold" style={{ color: deltaColor, background: "oklch(1 0 0 / 0.08)" }}>
                      {!modified ? "±0%" : `${up ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="mt-1 font-mono text-[10px]" style={{ color: "oklch(0.58 0.02 260)" }}>
                    base {formatMoney(current, currency)}/{mc.unit}
                  </div>

                  <div className="mt-2 flex items-center gap-2.5">
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={step}
                      value={val}
                      onChange={(e) => setValue(id, Number(e.target.value))}
                      className="sim-slider min-w-0 flex-1"
                      style={{ background: `linear-gradient(90deg, ${up ? RISK : GREEN} ${fillPct}%, oklch(0.36 0.02 262) ${fillPct}%)` }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={max}
                      step={step}
                      value={val}
                      onChange={(e) => {
                        if (e.target.value === "") return setValue(id, 0);
                        const n = Number(e.target.value);
                        if (Number.isNaN(n)) return;
                        setValue(id, Math.min(max, Math.max(0, n)));
                      }}
                      className="w-[74px] shrink-0 rounded-lg px-2 py-1 text-right font-mono text-[12px] font-semibold text-white outline-none"
                      style={{ background: "oklch(0.32 0.02 262)", border: "1px solid oklch(0.42 0.02 262)" }}
                    />
                    <button
                      type="button"
                      onClick={() => reset(id)}
                      disabled={!modified}
                      title="Reset to base"
                      className="shrink-0 text-white/70 transition hover:text-white disabled:opacity-30"
                    >
                      <RotateCcw className="h-[13px] w-[13px]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || selectedIds.length === 0}
          className="mt-4 w-full rounded-xl bg-white py-[11px] text-[13.5px] font-bold text-ink-900 transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "Simulating…" : `Run simulation${selectedIds.length > 1 ? ` · ${selectedIds.length} inputs` : ""}`}
        </button>

        {canSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={savePending || selectedIds.length === 0}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-[9px] text-[12.5px] font-semibold transition hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-40"
            style={{ border: "1px solid oklch(0.42 0.02 262)", color: saved ? GREEN : "white" }}
          >
            {saved ? <Check className="h-[13px] w-[13px]" /> : <Save className="h-[13px] w-[13px]" />}
            {savePending ? "Saving…" : saved ? "Setup saved" : "Save this setup"}
          </button>
        )}
        {saveMsg && !saved && (
          <p className="mt-1.5 text-center font-mono text-[10px]" style={{ color: RISK }}>{saveMsg}</p>
        )}

        <p className="mt-2.5 text-center font-mono text-[10px]" style={{ color: "oklch(0.55 0.02 260)" }}>
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
            {/* Simulated inputs — before → after per changed price. */}
            <div className="card p-[18px]">
              <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">Simulated inputs</div>
              <div className="flex flex-wrap gap-2">
                {result.inputs!.map((i) => {
                  const up = i.newPrice > i.currentPrice;
                  const flat = Math.abs(i.newPrice - i.currentPrice) < 1e-6;
                  const c = flat ? MUTED : up ? RISK : GREEN;
                  const pct = i.currentPrice > 0 ? ((i.newPrice - i.currentPrice) / i.currentPrice) * 100 : 0;
                  return (
                    <span
                      key={i.masterCostId}
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 font-mono text-[11.5px]"
                    >
                      <span className="font-semibold text-ink-900">{i.name}</span>
                      <span className="text-ink-400">{formatMoney(i.currentPrice, currency)}</span>
                      <ArrowRight className="h-3 w-3 text-ink-300" />
                      <span className="font-semibold" style={{ color: c }}>{formatMoney(i.newPrice, currency)}</span>
                      {!flat && <span style={{ color: c }}>({up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)</span>}
                    </span>
                  );
                })}
              </div>
            </div>

            {result.affectedCount === 0 ? (
              <div className="card p-5 text-[13.5px] text-ink-500">No products use these cost items, so nothing is affected.</div>
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
                  <span className="text-right">Margin Δ</span>
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
                Select one or more cost items, adjust their hypothetical prices, and run the simulation to see every affected SKU’s new margin.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
