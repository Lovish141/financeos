"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Scale, Boxes, Trash2, Loader2 } from "lucide-react";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { toast } from "@/components/toaster";
import { getTemplateDraft, saveTemplateForm } from "@/server/actions/template-actions";
import { qtyStepForUnit } from "@/lib/costing";
import { formatCurrency } from "@/lib/utils";

export type MasterCostOption = {
  id: string;
  name: string;
  type: "RAW_MATERIAL" | "COMPONENT" | "SERVICE";
  unit: string;
  currentCost: number;
};

type Line = { masterCostId: string; lineType: "WEIGHT" | "FIXED"; quantity: number | null };

export function TemplateFormDrawer({
  open,
  mode,
  templateId,
  masterCosts,
  currency,
  weightUnit,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  templateId: string | null;
  masterCosts: MasterCostOption[];
  currency: string;
  weightUnit: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costById = useMemo(() => new Map(masterCosts.map((m) => [m.id, m])), [masterCosts]);
  const rawMaterials = useMemo(() => masterCosts.filter((m) => m.type === "RAW_MATERIAL"), [masterCosts]);
  const others = useMemo(() => masterCosts.filter((m) => m.type !== "RAW_MATERIAL"), [masterCosts]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "create") {
      setName("");
      setCategory("");
      setLines([]);
    } else if (templateId) {
      setLoading(true);
      getTemplateDraft(templateId).then((res) => {
        if (!res.ok) {
          setError((res as { error?: string }).error ?? "Could not load template.");
          setLoading(false);
          return;
        }
        setName(res.name);
        setCategory(res.category);
        setLines(res.lines);
        setLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, templateId]);

  const weightLine = lines.find((l) => l.lineType === "WEIGHT");

  function addLine(lineType: "WEIGHT" | "FIXED") {
    const pool = lineType === "WEIGHT" ? rawMaterials : others;
    if (pool.length === 0) return;
    setLines((prev) => [...prev, { masterCostId: pool[0].id, lineType, quantity: lineType === "FIXED" ? 1 : null }]);
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const fixedTotal = lines
    .filter((l) => l.lineType === "FIXED")
    .reduce((sum, l) => sum + (costById.get(l.masterCostId)?.currentCost ?? 0) * (l.quantity ?? 0), 0);
  const weightRate = weightLine ? costById.get(weightLine.masterCostId)?.currentCost ?? 0 : 0;

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Template name is required.");

    setSaving(true);
    const res = await saveTemplateForm({
      id: mode === "edit" && templateId ? templateId : undefined,
      name: name.trim(),
      category: category.trim() || undefined,
      lines,
    });
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast(mode === "create" ? "Template created" : "Template updated");
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={640}>
      <DrawerHeader onClose={onClose}>
        <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
          {mode === "create" ? "New template" : "Edit template"}
        </h3>
      </DrawerHeader>

      <DrawerBody>
        {loading ? (
          <DrawerSkeleton rows={6} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Template name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Basin Mixer" autoFocus />
              </div>
              <div>
                <label className="label">Category</label>
                <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mixers" />
              </div>
            </div>

            {/* Recipe lines */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <label className="label mb-0">Recipe lines</label>
                <p className="mt-0.5 text-[11.5px] text-ink-400">One raw material by weight + any fixed components &amp; services.</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => addLine("WEIGHT")}
                  disabled={!!weightLine || rawMaterials.length === 0}
                >
                  <Scale className="h-3.5 w-3.5" /> Weight
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => addLine("FIXED")} disabled={others.length === 0}>
                  <Plus className="h-3.5 w-3.5" /> Fixed
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              {lines.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-ink-400">
                  No lines yet — add a weight-based raw material and fixed components.
                </div>
              ) : (
                lines.map((line, idx) => {
                  const mc = costById.get(line.masterCostId);
                  const pool = line.lineType === "WEIGHT" ? rawMaterials : others;
                  const isWeight = line.lineType === "WEIGHT";
                  return (
                    <div key={idx} className="flex items-center gap-2.5 border-b border-[oklch(0.96_0.003_250)] px-3.5 py-2.5 last:border-0">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isWeight ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-500"}`}
                      >
                        {isWeight ? <Scale className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </span>
                      <select
                        className="input flex-1 text-[13px]"
                        value={line.masterCostId}
                        onChange={(e) => updateLine(idx, { masterCostId: e.target.value })}
                      >
                        {pool.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {formatCurrency(m.currentCost, currency)}/{m.unit}
                          </option>
                        ))}
                      </select>
                      {isWeight ? (
                        <span className="w-[92px] shrink-0 text-right font-mono text-[11px] text-ink-400">per {weightUnit}</span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step={qtyStepForUnit(mc?.unit)}
                            value={line.quantity ?? ""}
                            onChange={(e) => updateLine(idx, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-[66px] rounded-lg border border-ink-300 px-2 py-1.5 text-right font-mono text-[13px] font-semibold text-ink-900 outline-none focus:border-brand-400"
                          />
                          <span className="w-[36px] font-mono text-[11px] text-ink-500">{mc?.unit}</span>
                        </div>
                      )}
                      <span className="w-[64px] shrink-0 text-right font-mono text-[13px] font-semibold text-ink-900">
                        {isWeight
                          ? `${formatCurrency(mc?.currentCost ?? 0, currency)}`
                          : formatCurrency((mc?.currentCost ?? 0) * (line.quantity ?? 0), currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-risk-500 hover:bg-risk-50"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Live cost preview */}
            <div className="flex items-center gap-3.5 rounded-xl px-[18px] py-4 text-white" style={{ background: "oklch(0.29 0.025 175)" }}>
              <div className="flex-1">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "oklch(0.82 0.04 168)" }}>
                  Cost per product
                </div>
                <div className="font-mono text-[12px]" style={{ color: "oklch(0.82 0.02 175)" }}>
                  fixed {formatCurrency(fixedTotal, currency)}
                  {weightLine && ` · + ${formatCurrency(weightRate, currency)} × weight`}
                </div>
              </div>
              <div className="text-right font-mono text-[22px] font-extrabold leading-none tracking-[-0.03em]" style={{ color: "oklch(0.85 0.08 168)" }}>
                {formatCurrency(fixedTotal, currency)}
                {weightLine && <span className="text-[13px] font-medium"> +</span>}
              </div>
            </div>

            <p className="text-[11.5px] text-ink-400">
              Total per SKU depends on the raw-material weight entered when creating a product.
            </p>

            {error && <p className="text-sm text-risk-500">{error}</p>}
          </div>
        )}
      </DrawerBody>

      <DrawerFooter>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Create template" : "Save recipe (new version)"}
        </button>
      </DrawerFooter>
    </Drawer>
  );
}
