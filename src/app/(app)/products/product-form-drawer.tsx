"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { toast } from "@/components/toaster";
import {
  createProduct,
  updateProduct,
  getProductDraft,
  type ProductDraft,
} from "@/server/actions/product-actions";
import { qtyStepForUnit } from "@/lib/costing";
import { formatCurrency } from "@/lib/utils";

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

type Row = { masterCostId: string; qty: string };
type Meta = { name: string; type: string; unit: string; currentCost: number };

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
  const [templateId, setTemplateId] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [rows, setRows] = useState<Row[]>([]);
  const [extraMeta, setExtraMeta] = useState<Record<string, Meta>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogById = useMemo(
    () => new Map(masterCosts.map((m) => [m.id, m as Meta])),
    [masterCosts],
  );
  const meta = (id: string): Meta =>
    catalogById.get(id) ?? extraMeta[id] ?? { name: "Unknown item", type: "COMPONENT", unit: "pc", currentCost: 0 };

  const seedFromTemplate = (tid: string): Row[] => {
    if (!tid) return [];
    const t = templates.find((x) => x.id === tid);
    return (t?.lines ?? []).map((l) => ({
      masterCostId: l.masterCostId,
      qty: String(l.lineType === "WEIGHT" ? 0 : l.quantity ?? 1),
    }));
  };

  // Initialise on open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "create") {
      const firstTid = templates[0]?.id ?? "";
      setName("");
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
        setPrice(String(d.sellingPrice));
        setStatus(d.status);
        setTemplateId(d.templateId ?? "");
        setRows(d.comps.map((c) => ({ masterCostId: c.masterCostId, qty: String(c.quantity) })));
        setExtraMeta(
          Object.fromEntries(
            d.comps.map((c) => [c.masterCostId, { name: c.name, type: c.type, unit: c.unit, currentCost: c.currentCost }]),
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
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.masterCostId !== id));
  }
  function addRow(id: string) {
    if (!id || rows.some((r) => r.masterCostId === id)) return;
    setRows((prev) => [...prev, { masterCostId: id, qty: "1" }]);
  }

  const totalCost = rows.reduce((sum, r) => sum + meta(r.masterCostId).currentCost * (parseFloat(r.qty) || 0), 0);
  const priceNum = parseFloat(price) || 0;
  const marginRs = priceNum - totalCost;
  const marginPct = priceNum > 0 ? (marginRs / priceNum) * 100 : 0;

  const addable = masterCosts.filter((m) => !rows.some((r) => r.masterCostId === m.id));

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Product name is required.");
    if (priceNum <= 0) return setError("Selling price must be greater than 0.");
    if (rows.length === 0) return setError("Add at least one component.");

    setSaving(true);
    const fd = new FormData();
    if (mode === "edit" && productId) fd.set("id", productId);
    fd.set("name", name.trim());
    fd.set("templateId", templateId);
    fd.set("sellingPrice", String(priceNum));
    fd.set("status", status);
    fd.set("comps", JSON.stringify(rows.map((r) => ({ masterCostId: r.masterCostId, quantity: parseFloat(r.qty) || 0 }))));

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
                <label className="label">Template</label>
                <select className="input" value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
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
                const lineTotal = m.currentCost * (parseFloat(r.qty) || 0);
                return (
                  <div key={r.masterCostId} className="flex items-center gap-2.5 border-b border-[oklch(0.96_0.003_250)] px-3.5 py-2.5 last:border-0">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_DOT[m.type] ?? TYPE_DOT.COMPONENT }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink-900">{m.name}</div>
                      <div className="font-mono text-[10px] text-ink-400">{TYPE_LABEL[m.type] ?? "Component"}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step={qtyStepForUnit(m.unit)}
                        value={r.qty}
                        onChange={(e) => setQty(r.masterCostId, e.target.value)}
                        className="w-[66px] rounded-lg border border-ink-300 px-2 py-1.5 text-right font-mono text-[13px] font-semibold text-ink-900 outline-none focus:border-brand-400"
                      />
                      <span className="min-w-[22px] font-mono text-[11px] text-ink-500">{m.unit}</span>
                    </div>
                    <span className="w-[60px] text-right font-mono text-[13px] font-semibold text-ink-900">
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
              <div className="p-2.5">
                <select
                  className="input cursor-pointer text-[13px] font-semibold text-brand-600"
                  value=""
                  onChange={(e) => { addRow(e.target.value); e.currentTarget.value = ""; }}
                  disabled={addable.length === 0}
                >
                  <option value="">+ Add component…</option>
                  {addable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {formatCurrency(m.currentCost, currency)}/{m.unit}
                    </option>
                  ))}
                </select>
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
              <div className="text-right text-[28px] font-extrabold leading-none tracking-[-0.03em]" style={{ color: "oklch(0.85 0.08 168)" }}>
                {marginPct.toFixed(1)}%
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
    </Drawer>
  );
}
