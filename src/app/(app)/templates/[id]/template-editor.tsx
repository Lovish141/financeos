"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Scale, Boxes, CheckCircle2 } from "lucide-react";
import { saveTemplate } from "@/server/actions/template-actions";
import { toast } from "@/components/toaster";
import { Card } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

type MasterCost = {
  id: string;
  name: string;
  type: "RAW_MATERIAL" | "COMPONENT" | "SERVICE";
  unit: string;
  currentCost: number;
};

type Line = {
  masterCostId: string;
  lineType: "WEIGHT" | "FIXED";
  quantity: number | null;
};

export function TemplateEditor({
  templateId,
  initialName,
  initialCategory,
  initialLines,
  masterCosts,
  currency,
  weightUnit,
  editable,
}: {
  templateId: string;
  initialName: string;
  initialCategory: string;
  initialLines: Line[];
  masterCosts: MasterCost[];
  currency: string;
  weightUnit: string;
  editable: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costById = useMemo(
    () => Object.fromEntries(masterCosts.map((m) => [m.id, m])),
    [masterCosts],
  );

  const rawMaterials = masterCosts.filter((m) => m.type === "RAW_MATERIAL");
  const others = masterCosts.filter((m) => m.type !== "RAW_MATERIAL");

  function addLine(lineType: "WEIGHT" | "FIXED") {
    const pool = lineType === "WEIGHT" ? rawMaterials : others;
    if (pool.length === 0) return;
    setLines((prev) => [
      ...prev,
      { masterCostId: pool[0].id, lineType, quantity: lineType === "FIXED" ? 1 : null },
    ]);
    setSaved(false);
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    setSaved(false);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setSaved(false);
  }

  // Live preview: fixed lines contribute qty×cost; the single weight line is
  // shown per-unit because the actual weight is supplied at the product level.
  const fixedTotal = lines
    .filter((l) => l.lineType === "FIXED")
    .reduce((sum, l) => sum + (costById[l.masterCostId]?.currentCost ?? 0) * (l.quantity ?? 0), 0);
  const weightLine = lines.find((l) => l.lineType === "WEIGHT");
  const weightRate = weightLine ? costById[weightLine.masterCostId]?.currentCost ?? 0 : 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", templateId);
    fd.set("name", name);
    fd.set("category", category);
    fd.set("lines", JSON.stringify(lines));
    const res = await saveTemplate(undefined, fd);
    setSaving(false);
    if (res?.error) setError(res.error);
    else {
      setSaved(true);
      toast("Template updated");
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Template name</label>
              <input className="input" value={name} disabled={!editable} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={category} disabled={!editable} onChange={(e) => { setCategory(e.target.value); setSaved(false); }} placeholder="Mixers" />
            </div>
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Recipe lines</h3>
              <p className="text-xs text-ink-500">One raw material by weight + any fixed-quantity components &amp; services.</p>
            </div>
            {editable && (
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => addLine("WEIGHT")} disabled={!!weightLine || rawMaterials.length === 0}>
                  <Scale className="h-3.5 w-3.5" /> Weight line
                </button>
                <button className="btn-secondary text-xs" onClick={() => addLine("FIXED")} disabled={others.length === 0}>
                  <Plus className="h-3.5 w-3.5" /> Fixed line
                </button>
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-ink-500">
              No lines yet. Add a weight-based raw material and fixed components.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {lines.map((line, idx) => {
                const mc = costById[line.masterCostId];
                const pool = line.lineType === "WEIGHT" ? rawMaterials : others;
                return (
                  <div key={idx} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${line.lineType === "WEIGHT" ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-500"}`}>
                      {line.lineType === "WEIGHT" ? <Scale className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                    </span>
                    <select
                      className="input flex-1"
                      value={line.masterCostId}
                      disabled={!editable}
                      onChange={(e) => updateLine(idx, { masterCostId: e.target.value })}
                    >
                      {pool.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {formatCurrency(m.currentCost, currency)}/{m.unit}
                        </option>
                      ))}
                    </select>
                    {line.lineType === "FIXED" ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="input w-20"
                          value={line.quantity ?? ""}
                          disabled={!editable}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <span className="text-xs text-ink-400">×</span>
                      </div>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-ink-400">per {weightUnit}</span>
                    )}
                    <span className="w-24 text-right text-sm font-medium text-ink-700">
                      {line.lineType === "FIXED"
                        ? formatCurrency((mc?.currentCost ?? 0) * (line.quantity ?? 0), currency)
                        : `${formatCurrency(mc?.currentCost ?? 0, currency)}/${weightUnit}`}
                    </span>
                    {editable && (
                      <button className="text-ink-300 hover:text-red-500" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Live cost preview */}
      <div className="space-y-4">
        <Card>
          <h3 className="text-sm font-semibold text-ink-900">Live cost preview</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Fixed components &amp; services</span>
              <span className="font-medium">{formatCurrency(fixedTotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Raw material</span>
              <span className="font-medium">
                {weightLine ? `${formatCurrency(weightRate, currency)}/${weightUnit}` : "—"}
              </span>
            </div>
            <div className="border-t border-[var(--border)] pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-ink-900">Cost per product</span>
                <span className="text-right text-sm font-semibold text-ink-900">
                  {formatCurrency(fixedTotal, currency)}
                  {weightLine && (
                    <span className="block text-xs font-normal text-ink-500">
                      + {formatCurrency(weightRate, currency)} × weight
                    </span>
                  )}
                </span>
              </div>
            </div>
            <p className="text-xs text-ink-400">
              Total per SKU depends on the brass weight you enter when creating a product.
            </p>
          </div>

          {editable && (
            <div className="mt-4 space-y-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
                {saved ? <><CheckCircle2 className="h-4 w-4" /> Saved</> : saving ? "Saving…" : "Save recipe (new version)"}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
