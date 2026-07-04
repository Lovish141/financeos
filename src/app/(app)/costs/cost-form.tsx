"use client";

import { useActionState } from "react";
import { createMasterCost, updateMasterCost, type ActionResult } from "@/server/actions/cost-actions";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";

interface CostFormProps {
  mode: "create" | "edit";
  initial?: {
    id: string;
    name: string;
    category: string | null;
    type: string;
    unit: string;
    currentCost: number;
  };
}

export function CostForm({ mode, initial }: CostFormProps) {
  const action = mode === "create" ? createMasterCost : updateMasterCost;
  const [state, formAction] = useActionState<ActionResult, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && initial && <input type="hidden" name="id" value={initial.id} />}
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input className="input" id="name" name="name" defaultValue={initial?.name} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select className="input" id="type" name="type" defaultValue={initial?.type ?? "RAW_MATERIAL"}>
            <option value="RAW_MATERIAL">Raw material (by weight)</option>
            <option value="COMPONENT">Component (per piece)</option>
            <option value="SERVICE">Service (per piece)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="unit">Unit</label>
          <input className="input" id="unit" name="unit" defaultValue={initial?.unit ?? "kg"} placeholder="kg / piece" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="currentCost">Current cost (₹)</label>
          <input className="input" id="currentCost" name="currentCost" type="number" step="0.01" min="0" defaultValue={initial?.currentCost} required />
        </div>
        <div>
          <label className="label" htmlFor="category">Category (optional)</label>
          <input className="input" id="category" name="category" defaultValue={initial?.category ?? ""} placeholder="Brass, Plating…" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-2 pt-2">
        <SubmitButton pendingText="Saving…">{mode === "create" ? "Create cost item" : "Save changes"}</SubmitButton>
        <Link href="/costs" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
