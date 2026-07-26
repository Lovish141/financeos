"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "@/components/toaster";
import { WEIGHT_UNITS, PIECE_UNITS } from "@/lib/csv";
import { formatCurrency } from "@/lib/utils";
import { createMasterCostInline, type CreatedMasterCost } from "@/server/actions/cost-actions";

const TYPES: { value: string; label: string; hint: string }[] = [
  { value: "RAW_MATERIAL", label: "Raw material", hint: "priced by weight" },
  { value: "COMPONENT", label: "Component", hint: "priced per piece" },
  { value: "SERVICE", label: "Service", hint: "priced per unit of work" },
];

const DEFAULT_UNIT: Record<string, string> = { RAW_MATERIAL: "kg", COMPONENT: "piece", SERVICE: "piece" };

/** Units the price book accepts for a given type (mirrors `validTypeUnit`). */
function unitsFor(type: string): string[] {
  return type === "RAW_MATERIAL" ? WEIGHT_UNITS : PIECE_UNITS;
}

/**
 * Inline "add a missing component" dialog. Layered above the product form drawer
 * (z-70 vs the drawer's z-46) so the half-filled product is never lost: the user
 * adds the cost item to the price book here and it drops straight into the recipe.
 * Writes to the same price book as Master Costs — this is a shortcut, not a
 * separate store.
 */
export function NewComponentDialog({
  open,
  currency,
  onClose,
  onCreated,
}: {
  open: boolean;
  currency: string;
  onClose: () => void;
  /** The freshly created price-book item, ready to add as a recipe line. */
  onCreated: (item: CreatedMasterCost) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("COMPONENT");
  const [unit, setUnit] = useState("piece");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Reset to a clean form each time it opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setType("COMPONENT");
    setUnit("piece");
    setCost("");
    setCategory("");
    setError(null);
  }, [open]);

  // Escape closes (unless a save is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  // Switching type re-defaults the unit so the pair is always valid.
  function onTypeChange(t: string) {
    setType(t);
    setUnit(DEFAULT_UNIT[t] ?? "piece");
  }

  async function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Name is required.");
    const costNum = parseFloat(cost);
    if (!(costNum >= 0)) return setError("Cost must be 0 or more.");

    setSaving(true);
    const res = await createMasterCostInline({ name: trimmed, category, type, unit, currentCost: costNum });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    toast(`${res.item.name} added to the price book`);
    onCreated(res.item);
    onClose();
  }

  if (!mounted || !open) return null;

  const costNum = parseFloat(cost);
  const preview = Number.isFinite(costNum) && costNum >= 0 ? `${formatCurrency(costNum, currency)} / ${unit}` : null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "oklch(0.2 0.02 260 / 0.35)", backdropFilter: "blur(3px)" }}
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New component"
        className="animate-pop flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-[18px] bg-white p-[26px]"
        style={{ boxShadow: "0 24px 70px oklch(0.2 0.02 260 / 0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-[13px]"
            style={{ background: "oklch(0.955 0.025 168)", color: "oklch(0.48 0.08 168)" }}
          >
            <PackagePlus className="h-6 w-6" strokeWidth={2} />
          </div>
          <h3 className="mb-1.5 text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">New component</h3>
          <p className="mb-5 text-[13px] leading-[1.55] text-ink-500">
            Adds a cost item to the price book and drops it straight into this product.
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="label">Item name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ceramic Cartridge"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
            </div>

            <div>
              <label className="label">Type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {TYPES.map((t) => {
                  const on = type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => onTypeChange(t.value)}
                      title={t.hint}
                      className={`rounded-[10px] border px-2 py-2 text-left transition-colors ${
                        on ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
                      }`}
                    >
                      <span className={`block text-[12px] font-semibold ${on ? "text-brand-700" : "text-ink-700"}`}>
                        {t.label}
                      </span>
                      <span className="mt-0.5 block font-mono text-[9px] text-ink-400">{t.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cost (₹)</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Unit</label>
                {/* Only units valid for the chosen type, so an invalid pair is unreachable. */}
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {unitsFor(type).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Category (optional)</label>
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Metal, Plating, Fittings…"
              />
            </div>

            {preview && (
              <div className="rounded-[10px] px-[13px] py-[10px] font-mono text-[11.5px] text-ink-600" style={{ background: "oklch(0.97 0.004 250)" }}>
                Will be priced at <b className="text-ink-900">{preview}</b>
              </div>
            )}

            {error && <p className="text-[13px] text-risk-500">{error}</p>}
          </div>
        </div>

        <div className="mt-[22px] flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex flex-1 items-center justify-center rounded-[10px] border border-ink-200 bg-white py-[11px] text-[13.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-[11px] text-[13.5px] font-bold text-white transition-[filter] hover:brightness-95 disabled:opacity-60"
            style={{ background: "oklch(0.48 0.08 168)" }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Creating…" : "Create & add"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
