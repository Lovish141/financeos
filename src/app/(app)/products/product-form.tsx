"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createProduct, updateProduct } from "@/server/actions/product-actions";
import type { ActionResult } from "@/server/actions/cost-actions";
import { SubmitButton } from "@/components/submit-button";
import { MarginPill } from "@/components/margin-pill";
import { marginHealth, type MarginThresholds } from "@/lib/costing";
import { formatCurrency } from "@/lib/utils";

type TemplateInfo = { id: string; name: string; fixedTotal: number; weightRate: number };

export function ProductForm({
  mode,
  templates,
  preselectTemplateId,
  currency,
  weightUnit,
  thresholds,
  initial,
}: {
  mode: "create" | "edit";
  templates: TemplateInfo[];
  preselectTemplateId?: string;
  currency: string;
  weightUnit: string;
  thresholds: MarginThresholds;
  initial?: {
    id: string;
    name: string;
    brassWeight: number;
    sellingPrice: number;
    status: string;
  };
}) {
  const action = mode === "create" ? createProduct : updateProduct;
  const [state, formAction] = useActionState<ActionResult, FormData>(action, undefined);

  const [templateId, setTemplateId] = useState(
    preselectTemplateId ?? templates[0]?.id ?? "",
  );
  const [weight, setWeight] = useState(initial?.brassWeight ?? 0);
  const [price, setPrice] = useState(initial?.sellingPrice ?? 0);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? templates[0],
    [templates, templateId],
  );

  const totalCost = template ? template.fixedTotal + template.weightRate * weight : 0;
  const margin = price - totalCost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  const health = marginHealth(marginPct, thresholds);

  return (
    <form action={formAction} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        {mode === "edit" && initial && <input type="hidden" name="id" value={initial.id} />}
        <div>
          <label className="label" htmlFor="name">Product name</label>
          <input className="input" id="name" name="name" defaultValue={initial?.name} placeholder="Elegant Basin Mixer" required autoFocus />
        </div>

        {mode === "create" ? (
          <>
            <div>
              <label className="label" htmlFor="templateId">Template</label>
              <select className="input" id="templateId" name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sku">SKU (optional — auto-generated if blank)</label>
              <input className="input" id="sku" name="sku" placeholder="MIX-BASIN-01" />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select className="input" id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="DISCONTINUED">Discontinued</option>
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="brassWeight">Brass weight ({weightUnit})</label>
            <input className="input" id="brassWeight" name="brassWeight" type="number" step="0.001" min="0" value={weight} onChange={(e) => setWeight(Number(e.target.value))} required />
          </div>
          <div>
            <label className="label" htmlFor="sellingPrice">Selling price (₹)</label>
            <input className="input" id="sellingPrice" name="sellingPrice" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(Number(e.target.value))} required />
          </div>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText="Saving…">{mode === "create" ? "Create product" : "Save changes"}</SubmitButton>
          <Link href="/products" className="btn-ghost">Cancel</Link>
        </div>
      </div>

      {/* Live margin preview */}
      <div className="rounded-2xl border border-[var(--border)] bg-ink-50 p-4">
        <h3 className="text-sm font-semibold text-ink-900">Live preview</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Fixed cost</dt><dd className="font-medium">{formatCurrency(template?.fixedTotal ?? 0, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Material</dt><dd className="font-medium">{formatCurrency((template?.weightRate ?? 0) * weight, currency)}</dd></div>
          <div className="flex justify-between border-t border-ink-200 pt-2"><dt className="text-ink-900">Total cost</dt><dd className="font-semibold">{formatCurrency(totalCost, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Selling price</dt><dd className="font-medium">{formatCurrency(price, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-900">Gross margin</dt><dd className={`font-semibold ${margin < 0 ? "text-red-600" : "text-ink-900"}`}>{formatCurrency(margin, currency)}</dd></div>
        </dl>
        <div className="mt-3 flex items-center justify-between border-t border-ink-200 pt-3">
          <span className="text-sm text-ink-500">Margin health</span>
          <MarginPill health={health} pct={isFinite(marginPct) ? marginPct : 0} />
        </div>
      </div>
    </form>
  );
}
