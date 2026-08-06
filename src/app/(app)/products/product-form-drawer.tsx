"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, X, AlertTriangle, Plus } from "lucide-react";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { toast } from "@/components/toaster";
import {
  createProduct,
  updateProduct,
  getProductDraft,
  type ProductDraft,
} from "@/server/actions/product-actions";
import type { CreatedMasterCost } from "@/server/actions/cost-actions";
import { qtyStepForUnit, isPercentOfSalesUnit, isWeightBilledService, weightUnitInKg } from "@/lib/costing";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { NewComponentDialog } from "./new-component-dialog";

const TYPE_DOT: Record<string, string> = {
  RAW_MATERIAL: "oklch(0.58 0.12 45)",
  COMPONENT: "oklch(0.5 0.1 250)",
  SERVICE: "oklch(0.52 0.09 300)",
};
const TYPE_LABEL: Record<string, string> = {
  RAW_MATERIAL: "Raw material",
  COMPONENT: "Component",
  SERVICE: "Service",
};

export type TemplateOption = {
  id: string;
  name: string;
  category: string | null;
  lines: { masterCostId: string; lineType: "WEIGHT" | "FIXED"; quantity: number | null }[];
};
export type MasterCostOption = { id: string; name: string; type: string; unit: string; currentCost: number };

/**
 * A recipe row as edited here. How it prices follows the cost item's UNIT, not
 * its type — any master cost may carry any unit:
 *
 *   "% of sales"  → `qty` holds the percentage of the selling price; `rate` unused.
 *   anything else → `qty` × `rate`, where `rate` is the ₹ per unit (₹/kg, ₹/piece…).
 *
 * One exception on the quantity side: a service priced by weight bills the
 * product's raw-material weight, so its `qty` is derived, not typed.
 *
 * Both editable prices — the percentage and the rate — are blank-able: blank
 * (undefined/"") means "use the master cost's live value", so the row keeps
 * tracking the price book until the user types a product-specific number. The
 * master's value shows as the input's placeholder either way.
 */
type Row = { masterCostId: string; qty: string; rate?: string };
type Meta = { name: string; type: string; unit: string; currentCost: number; archived: boolean };

/** Parse a blank-able price field: blank/garbage → undefined (use the master's value). */
function priceOverride(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Round a derived weight for display — the maths yields long decimals. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * A fresh row for a cost item. Its price override starts blank so the row tracks
 * the price book; only the quantity (which is genuinely per-product) is seeded.
 */
function newRow(id: string, m: { unit: string; type: string }, qty = "1"): Row {
  if (isPercentOfSalesUnit(m.unit)) return { masterCostId: id, qty: "" }; // percentage lives in `qty`
  // Weight-billed services have no quantity of their own — it comes from the
  // raw-material lines, so nothing is seeded here.
  if (isWeightBilledService(m.type, m.unit)) return { masterCostId: id, qty: "", rate: "" };
  return { masterCostId: id, qty, rate: "" };
}

export function ProductFormDrawer({
  open,
  mode,
  productId,
  templates,
  masterCosts,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  productId: string | null;
  templates: TemplateOption[];
  masterCosts: MasterCostOption[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [rows, setRows] = useState<Row[]>([]);
  const [extraMeta, setExtraMeta] = useState<Record<string, Meta>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCompOpen, setNewCompOpen] = useState(false);
  // Components created inline from this drawer. They're already in the price book,
  // but the server-rendered `masterCosts` prop won't include them until the page
  // data refreshes — so keep them here to populate the picker straight away.
  const [justCreated, setJustCreated] = useState<MasterCostOption[]>([]);

  // Full add-pool: the price book as rendered plus anything created inline
  // (deduped by id, so nothing doubles up once the page props catch up).
  const pool = useMemo(() => {
    const byId = new Map(masterCosts.map((m) => [m.id, m]));
    for (const m of justCreated) if (!byId.has(m.id)) byId.set(m.id, m);
    return [...byId.values()];
  }, [masterCosts, justCreated]);

  const catalogById = useMemo(
    // Add-pool items are always non-archived (the page excludes archived).
    () => new Map(pool.map((m) => [m.id, { ...m, archived: false } as Meta])),
    [pool],
  );
  const meta = (id: string): Meta =>
    catalogById.get(id) ?? extraMeta[id] ?? { name: "Unknown item", type: "COMPONENT", unit: "pc", currentCost: 0, archived: false };

  const seedFromTemplate = (tid: string): Row[] => {
    if (!tid) return [];
    const t = templates.find((x) => x.id === tid);
    // WEIGHT lines carry no template quantity (it's supplied per product), so they
    // start at 0 for the user to fill in; fixed lines inherit the template's count.
    return (t?.lines ?? []).map((l) =>
      newRow(l.masterCostId, meta(l.masterCostId), l.lineType === "WEIGHT" ? "0" : String(l.quantity ?? 1)),
    );
  };

  // Initialise on open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "create") {
      const firstTid = templates[0]?.id ?? "";
      setName("");
      setProductCode("");
      setSeriesName("");
      setPrice("");
      setStatus("ACTIVE");
      setTemplateId(firstTid);
      setRows(seedFromTemplate(firstTid));
      setExtraMeta({});
    } else if (productId) {
      setLoading(true);
      getProductDraft(productId).then((res) => {
        if (!res.ok) {
          setError((res as { error?: string }).error ?? "Could not load product.");
          setLoading(false);
          return;
        }
        const d = res as ProductDraft;
        setName(d.name);
        setProductCode(d.productCode ?? "");
        setSeriesName(d.seriesName ?? "");
        setPrice(String(d.sellingPrice));
        setStatus(d.status);
        setTemplateId(d.templateId ?? "");
        setRows(
          // Show the stored override, or blank when none was stored (legacy rows
          // included) — a blank field keeps tracking the master's live value.
          d.comps.map((c) =>
            isPercentOfSalesUnit(c.unit)
              ? { masterCostId: c.masterCostId, qty: c.percent != null ? String(c.percent) : "" }
              : {
                  masterCostId: c.masterCostId,
                  qty: String(c.quantity),
                  rate: c.rate != null ? String(c.rate) : "",
                },
          ),
        );
        setExtraMeta(
          Object.fromEntries(
            d.comps.map((c) => [c.masterCostId, { name: c.name, type: c.type, unit: c.unit, currentCost: c.currentCost, archived: c.archived }]),
          ),
        );
        setLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, productId]);

  function onTemplateChange(tid: string) {
    setTemplateId(tid);
    setRows(seedFromTemplate(tid));
  }

  function setQty(id: string, qty: string) {
    setRows((prev) => prev.map((r) => (r.masterCostId === id ? { ...r, qty } : r)));
  }
  function setRate(id: string, rate: string) {
    setRows((prev) => prev.map((r) => (r.masterCostId === id ? { ...r, rate } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.masterCostId !== id));
  }
  function addRow(id: string) {
    if (!id || rows.some((r) => r.masterCostId === id)) return;
    setRows((prev) => [...prev, newRow(id, meta(id))]);
  }

  const priceNum = parseFloat(price) || 0;

  // The product's raw-material weight in kg — what weight-priced services bill
  // against. Mirrors rawMaterialWeightKg in lib/costing.ts over the live rows.
  const weightKg = rows.reduce((sum, r) => {
    const m = meta(r.masterCostId);
    if (m.archived || m.type !== "RAW_MATERIAL") return sum;
    const kgPerUnit = weightUnitInKg(m.unit);
    return kgPerUnit === null ? sum : sum + (parseFloat(r.qty) || 0) * kgPerUnit;
  }, 0);

  /** A weight-billed service's quantity, in its own unit (derived, never typed). */
  function derivedQtyOf(m: Meta): number {
    return weightKg / weightUnitInKg(m.unit)!;
  }

  /** The quantity a row actually contributes — derived for weight-billed services. */
  function qtyOf(m: Meta, r: Row): number {
    return isWeightBilledService(m.type, m.unit) ? derivedQtyOf(m) : parseFloat(r.qty) || 0;
  }

  // Resolve one row's rupee cost, keyed off the cost item's unit. Archived items
  // count as 0 (Live Reference). Mirrors computeProductCost in lib/costing.ts.
  function lineCostOf(m: Meta, r: Row): number {
    if (m.archived) return 0;
    // "% of sales": `qty` carries the percentage, applied to the price once (no count).
    if (isPercentOfSalesUnit(m.unit)) return ((priceOverride(r.qty) ?? m.currentCost) / 100) * priceNum;
    // Any other unit: the product's own ₹/unit rate when set, else the master's.
    return (priceOverride(r.rate) ?? m.currentCost) * qtyOf(m, r);
  }

  const totalCost = rows.reduce((sum, r) => sum + lineCostOf(meta(r.masterCostId), r), 0);
  const marginRs = priceNum - totalCost;
  const marginPct = priceNum > 0 ? (marginRs / priceNum) * 100 : 0;

  const addable = pool.filter((m) => !rows.some((r) => r.masterCostId === m.id));

  // A component created in the inline dialog joins the pool and the recipe at once,
  // so the user lands back on a product that already has the line they needed.
  function onComponentCreated(item: CreatedMasterCost) {
    setJustCreated((prev) => [...prev, item]);
    setRows((prev) => (prev.some((r) => r.masterCostId === item.id) ? prev : [...prev, newRow(item.id, item)]));
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Product name is required.");
    if (priceNum <= 0) return setError("Selling price must be greater than 0.");
    if (rows.length === 0) return setError("Add at least one component.");

    setSaving(true);
    const fd = new FormData();
    if (mode === "edit" && productId) fd.set("id", productId);
    fd.set("name", name.trim());
    fd.set("productCode", productCode.trim());
    fd.set("seriesName", seriesName.trim());
    fd.set("templateId", templateId);
    fd.set("sellingPrice", String(priceNum));
    fd.set("status", status);
    fd.set(
      "comps",
      JSON.stringify(
        // A price the user typed is stored on the line; a blank one is omitted so
        // the line keeps resolving live from the price book.
        rows.map((r) => {
          const m = meta(r.masterCostId);
          const id = r.masterCostId;
          if (isPercentOfSalesUnit(m.unit)) {
            // % of sales: the percentage is the price; quantity is pinned to 1
            // because the percentage applies to the selling price exactly once.
            const percent = priceOverride(r.qty);
            return percent !== undefined ? { masterCostId: id, quantity: 1, percent } : { masterCostId: id, quantity: 1 };
          }
          // Weight-billed services store quantity 1 as a placeholder — costing
          // derives the real quantity from the raw-material weight at read time,
          // so a stored count would only go stale.
          const quantity = isWeightBilledService(m.type, m.unit) ? 1 : parseFloat(r.qty) || 0;
          const rate = priceOverride(r.rate);
          return rate !== undefined ? { masterCostId: id, quantity, rate } : { masterCostId: id, quantity };
        }),
      ),
    );

    const res = await (mode === "create" ? createProduct : updateProduct)(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast(mode === "create" ? "Product created" : "Product updated");
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={660}>
      <DrawerHeader onClose={onClose}>
        <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
          {mode === "create" ? "New product" : "Edit product"}
        </h3>
      </DrawerHeader>

      <DrawerBody>
        {loading ? (
          <DrawerSkeleton rows={6} />
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Product name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium Basin Mixer" autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Product code</label>
                <input className="input" value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="e.g. BM-2043" />
              </div>
              <div>
                <label className="label">Series name</label>
                <input className="input" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. Aqua Series" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Template</label>
                <select className="input" value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} title={t.name}>{t.name}</option>
                  ))}
                  <option value="">Empty Template (start from scratch)</option>
                </select>
              </div>
              <div>
                <label className="label">Selling price (₹)</label>
                <input className="input" type="number" step="10" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
              </div>
            </div>

            {mode === "edit" && (
              <div>
                <label className="label">Status</label>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="DISCONTINUED">Discontinued</option>
                </select>
              </div>
            )}

            {/* Components editor */}
            <div className="flex items-center justify-between pt-1">
              <label className="label mb-0">Components &amp; quantities</label>
              {templateId && (
                <button
                  type="button"
                  onClick={() => setRows(seedFromTemplate(templateId))}
                  className="flex items-center gap-1 font-mono text-[10.5px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  <RotateCcw className="h-3 w-3" /> Reset to template
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              {rows.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-ink-400">
                  No components yet — add one below.
                </div>
              )}
              {rows.map((r) => {
                const m = meta(r.masterCostId);
                const isPct = isPercentOfSalesUnit(m.unit);
                // A weight-priced service bills the raw-material weight, so its
                // quantity is shown read-only rather than typed.
                const fromWeight = isWeightBilledService(m.type, m.unit);
                const lineTotal = lineCostOf(m, r);
                return (
                  <div key={r.masterCostId} className="flex items-center gap-2.5 border-b border-[oklch(0.96_0.003_250)] px-3.5 py-2.5 last:border-0">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.archived ? "oklch(0.7 0.1 65)" : TYPE_DOT[m.type] ?? TYPE_DOT.COMPONENT }} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[13px] font-semibold ${m.archived ? "text-ink-400" : "text-ink-900"}`} title={m.name}>{m.name}</div>
                      {m.archived ? (
                        <div
                          className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-medium"
                          style={{ background: "oklch(0.96 0.04 75)", color: "oklch(0.45 0.1 65)" }}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2} />
                          Needs attention — cost archived
                        </div>
                      ) : (
                        <div className="font-mono text-[10px] text-ink-400">
                          {TYPE_LABEL[m.type] ?? "Component"}
                          {fromWeight && " · billed on raw material weight"}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {fromWeight ? (
                        // Derived from the raw-material rows above — there is nothing
                        // to type, so it reads as a value, not a field.
                        <span
                          className="w-[58px] rounded-lg bg-ink-50 px-2 py-1.5 text-right font-mono text-[13px] font-semibold text-ink-500"
                          title="Taken from this product's raw material weight"
                        >
                          {round3(derivedQtyOf(m))}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          // % of sales rows edit the percentage (no count); others a quantity.
                          step={isPct ? "0.1" : qtyStepForUnit(m.unit)}
                          value={r.qty}
                          onChange={(e) => setQty(r.masterCostId, e.target.value)}
                          // On a "% of sales" row this field IS the price, so it's
                          // blank-able like the rate field — the placeholder shows the
                          // price-book percentage the row falls back to.
                          placeholder={isPct ? String(m.currentCost) : undefined}
                          title={
                            isPct
                              ? "Percentage of this product's selling price — leave blank to use the price-book rate"
                              : `Quantity in ${m.unit}`
                          }
                          className="w-[58px] rounded-lg border border-ink-300 px-2 py-1.5 text-right font-mono text-[13px] font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400 focus:border-brand-400"
                        />
                      )}
                      <span className={`font-mono text-[11px] text-ink-500 ${isPct ? "whitespace-nowrap" : "min-w-[20px]"}`}>
                        {isPct ? "% of sales" : m.unit}
                      </span>
                      {!isPct && (
                        // Every non-percentage row carries a per-product ₹/unit rate that
                        // overrides the master's shared rate for this SKU; blank falls back
                        // to it (shown as the placeholder), so the row tracks the live rate.
                        <>
                          <span className="font-mono text-[11px] text-ink-400">×</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.rate ?? ""}
                            onChange={(e) => setRate(r.masterCostId, e.target.value)}
                            placeholder={String(m.currentCost)}
                            title="Cost per unit for this product — leave blank to use the price-book rate"
                            className="w-[64px] rounded-lg border border-ink-300 px-2 py-1.5 text-right font-mono text-[13px] font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400 focus:border-brand-400"
                          />
                          <span className="min-w-[20px] font-mono text-[11px] text-ink-500">/{m.unit}</span>
                        </>
                      )}
                    </div>
                    <span className="min-w-[60px] shrink-0 whitespace-nowrap text-right font-mono text-[13px] font-semibold text-ink-900" title={formatCurrency(lineTotal, currency)}>
                      {formatCurrency(lineTotal, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(r.masterCostId)}
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-risk-500 hover:bg-risk-50"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 p-2.5">
                <select
                  className="input min-w-0 flex-1 cursor-pointer text-[13px] font-semibold text-brand-600"
                  value=""
                  onChange={(e) => { addRow(e.target.value); e.currentTarget.value = ""; }}
                  disabled={addable.length === 0}
                >
                  <option value="">{addable.length === 0 ? "All components added" : "Add component…"}</option>
                  {addable.map((m) => (
                    <option key={m.id} value={m.id} title={m.name}>
                      {m.name} — {isPercentOfSalesUnit(m.unit) ? `${m.currentCost}% of sales` : `${formatCurrency(m.currentCost, currency)}/${m.unit}`}
                    </option>
                  ))}
                </select>
                {/* Escape hatch for a component that isn't in the price book yet —
                    creating it here avoids losing this half-filled product. */}
                <button
                  type="button"
                  onClick={() => setNewCompOpen(true)}
                  title="Create a component that isn't in the price book yet"
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-brand-200 bg-brand-50 px-2.5 py-[9px] text-[12.5px] font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 hover:text-brand-800"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} /> New component
                </button>
              </div>
            </div>

            <div className="flex justify-between font-mono text-[11.5px] text-ink-500">
              <span>Components cost</span>
              <span className="font-semibold text-ink-800">{formatCurrency(totalCost, currency)}</span>
            </div>

            {/* Live margin preview */}
            <div className="flex items-center gap-3.5 rounded-xl px-[18px] py-4 text-white" style={{ background: "oklch(0.29 0.025 175)" }}>
              <div className="flex-1">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "oklch(0.82 0.04 168)" }}>
                  Live margin preview
                </div>
                <div className="font-mono text-[12px]" style={{ color: "oklch(0.82 0.02 175)" }}>
                  cost {formatCurrency(totalCost, currency)} · {formatCurrency(marginRs, currency)}/unit
                </div>
              </div>
              <div className="min-w-0 truncate text-right text-[28px] font-extrabold leading-none tracking-[-0.03em]" style={{ color: "oklch(0.85 0.08 168)" }} title={formatPercent(marginPct)}>
                {formatPercent(marginPct)}
              </div>
            </div>

            {error && <p className="text-sm text-risk-500">{error}</p>}
          </div>
        )}
      </DrawerBody>

      <DrawerFooter>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
      </DrawerFooter>

      {/* Portals above this drawer, so the in-progress product stays untouched. */}
      <NewComponentDialog
        open={newCompOpen}
        currency={currency}
        onClose={() => setNewCompOpen(false)}
        onCreated={onComponentCreated}
      />
    </Drawer>
  );
}
