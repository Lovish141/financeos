"use client";

import { Suspense, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Loader2, Archive, RotateCcw, Upload, UploadCloud, FileText, X, Download, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { Drawer, DrawerBody, DrawerCloseButton, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toaster";
import {
  createMasterCost,
  updateMasterCost,
  archiveMasterCost,
  restoreMasterCost,
  getMasterCostDetail,
  getMasterCostImpact,
  importMasterCostsCsv,
  type MasterCostDetail,
  type MasterCostImpact,
  type ImportResult,
} from "@/server/actions/cost-actions";
import { formatCurrency, formatRelativeShort } from "@/lib/utils";
import { CostImpact } from "./cost-impact";

const GREEN = "oklch(0.48 0.08 168)";

export type CostInitial = { id: string; name: string; category: string | null; type: string; unit: string; currentCost: number };

function impactCount(i: MasterCostImpact | null): number {
  return i ? i.templates.length + i.products.length : 0;
}

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
const DEFAULT_UNIT: Record<string, string> = { RAW_MATERIAL: "kg", COMPONENT: "piece", SERVICE: "piece" };

// ---- pub/sub (mirrors products/product-drawers.tsx) -----------------------
type CostEvent =
  | { kind: "create" }
  | { kind: "edit"; initial: CostInitial }
  | { kind: "preview"; id: string }
  | { kind: "import" };
const listeners = new Set<(e: CostEvent) => void>();
export function openCostCreate() {
  listeners.forEach((l) => l({ kind: "create" }));
}
export function openCostImport() {
  listeners.forEach((l) => l({ kind: "import" }));
}
export function openCostEdit(initial: CostInitial) {
  listeners.forEach((l) => l({ kind: "edit", initial }));
}
export function openCostPreview(id: string) {
  listeners.forEach((l) => l({ kind: "preview", id }));
}

// Fired after a create/edit/archive/restore/import so the client-rendered table
// can refetch without a full RSC refresh (mirrors products/product-drawers.tsx).
const changeListeners = new Set<() => void>();
export function notifyCostsChanged() {
  changeListeners.forEach((l) => l());
}
export function onCostsChanged(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export function NewCostButton() {
  return (
    <button type="button" className="btn-primary" onClick={openCostCreate}>
      <Plus className="h-4 w-4" /> New cost item
    </button>
  );
}
export function ImportCostButton() {
  return (
    <button type="button" className="btn-ghost" onClick={openCostImport}>
      <Upload className="h-4 w-4" /> Import CSV
    </button>
  );
}
export function CostRowOpen({ id, className, title, children }: { id: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} className={className} onClick={() => openCostPreview(id)}>
      {children}
    </button>
  );
}
export function CostEditButton({ initial }: { initial: CostInitial }) {
  return (
    <button type="button" className="icon-btn" title="Edit" onClick={() => openCostEdit(initial)}>
      <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
    </button>
  );
}

// ---- controller ------------------------------------------------------------
function CostDrawersController({ editable }: { editable: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<CostEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const l = (e: CostEvent) => {
      setView(e);
      setOpen(true);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Deep link: /costs?new=1 opens the create form, ?import=1 opens CSV import
  // (e.g. from onboarding).
  useEffect(() => {
    if (!editable) return;
    const wantsImport = searchParams.get("import");
    if (!searchParams.get("new") && !wantsImport) return;
    setView({ kind: wantsImport ? "import" : "create" });
    setOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("import");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const formOpen = open && (view?.kind === "create" || view?.kind === "edit");
  const previewOpen = open && view?.kind === "preview";
  const importOpen = open && view?.kind === "import";

  return (
    <>
      <CostFormDrawer
        open={!!formOpen}
        mode={view?.kind === "edit" ? "edit" : "create"}
        initial={view?.kind === "edit" ? view.initial : undefined}
        onClose={() => setOpen(false)}
        onSaved={() => notifyCostsChanged()}
      />
      <CostPreviewDrawer
        open={!!previewOpen}
        id={view?.kind === "preview" ? view.id : null}
        editable={editable}
        onClose={() => setOpen(false)}
        onEdit={(initial) => setView({ kind: "edit", initial })}
        onChanged={() => notifyCostsChanged()}
      />
      {/* Mounted only while open so useActionState resets between imports. */}
      {importOpen && (
        <CostImportDrawer onClose={() => setOpen(false)} onImported={() => notifyCostsChanged()} />
      )}
    </>
  );
}

export function CostDrawers({ editable }: { editable: boolean }) {
  // useSearchParams needs a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <CostDrawersController editable={editable} />
    </Suspense>
  );
}

// ---- create / edit ---------------------------------------------------------
function CostFormDrawer({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: CostInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("RAW_MATERIAL");
  const [unit, setUnit] = useState("kg");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<MasterCostImpact | null>(null);

  // Non-blocking impact warning: which templates/products this edit will affect
  // live (Live Reference Architecture). Only relevant when editing.
  useEffect(() => {
    setImpact(null);
    if (!open || mode !== "edit" || !initial) return;
    let active = true;
    getMasterCostImpact(initial.id).then((res) => {
      if (active) setImpact(res);
    });
    return () => {
      active = false;
    };
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && initial) {
      setName(initial.name);
      setType(initial.type);
      setUnit(initial.unit);
      setCost(String(initial.currentCost));
      setCategory(initial.category ?? "");
    } else {
      setName("");
      setType("RAW_MATERIAL");
      setUnit("kg");
      setCost("");
      setCategory("");
    }
  }, [open, mode, initial]);

  function onTypeChange(t: string) {
    setType(t);
    setUnit(DEFAULT_UNIT[t] ?? "piece");
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!(parseFloat(cost) >= 0)) return setError("Cost must be 0 or more.");

    setSaving(true);
    const fd = new FormData();
    if (mode === "edit" && initial) fd.set("id", initial.id);
    fd.set("name", name.trim());
    fd.set("type", type);
    fd.set("unit", unit);
    fd.set("currentCost", cost);
    fd.set("category", category);

    const res = await (mode === "create" ? createMasterCost : updateMasterCost)(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast(mode === "create" ? "Cost item added" : "Cost item updated");
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={452}>
      <DrawerHeader onClose={onClose}>
        <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
          {mode === "create" ? "New cost item" : "Edit cost item"}
        </h3>
      </DrawerHeader>

      <DrawerBody>
        <div className="space-y-4">
          <div>
            <label className="label">Item name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brass ingot" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={type} onChange={(e) => onTypeChange(e.target.value)}>
                <option value="RAW_MATERIAL">Raw material (by weight)</option>
                <option value="COMPONENT">Component (per piece)</option>
                <option value="SERVICE">Service (per piece)</option>
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg / piece" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Current cost (₹)</label>
              <input className="input" type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Category (optional)</label>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Metal, Plating…" />
            </div>
          </div>
          {mode === "edit" && impactCount(impact) > 0 && impact && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "oklch(0.42 0.09 65)" }}>
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
                Changes apply live wherever this cost is used
              </div>
              <CostImpact impact={impact} />
            </div>
          )}
          <div className="rounded-[10px] px-[13px] py-[11px] font-mono text-[11px] text-ink-500" style={{ background: "oklch(0.97 0.004 250)" }}>
            Editing the price writes a history entry — the previous value is preserved for trend tracking.
          </div>
          {error && <p className="text-sm text-risk-500">{error}</p>}
        </div>
      </DrawerBody>

      <DrawerFooter>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Create cost item" : "Save changes"}
        </button>
      </DrawerFooter>
    </Drawer>
  );
}

// ---- preview ---------------------------------------------------------------
function CostPreviewDrawer({
  open,
  id,
  editable,
  onClose,
  onEdit,
  onChanged,
}: {
  open: boolean;
  id: string | null;
  editable: boolean;
  onClose: () => void;
  onEdit: (initial: CostInitial) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<MasterCostDetail | null>(null);

  useEffect(() => {
    if (!open || !id) return;
    let active = true;
    setData(null);
    getMasterCostDetail(id).then((res) => {
      if (active) setData(res.ok ? (res as MasterCostDetail) : null);
    });
    return () => {
      active = false;
    };
  }, [open, id]);

  const initial: CostInitial | null = data
    ? { id: data.id, name: data.name, category: data.category, type: data.type, unit: data.unit, currentCost: data.currentCost }
    : null;

  return (
    <Drawer open={open} onClose={onClose} width={452}>
      <div className="border-b border-[var(--border)] px-[26px] pb-[18px] pt-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {data && (
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <span className="h-2 w-2 rounded-full" style={{ background: TYPE_DOT[data.type] }} />
                {TYPE_LABEL[data.type]} · {data.unit}
              </div>
            )}
            <h2 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink-900" title={data?.name}>{data?.name ?? "Loading…"}</h2>
          </div>
          <DrawerCloseButton onClose={onClose} />
        </div>
        {editable && data && initial && (
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => onEdit(initial)}>
              <Pencil className="h-[14px] w-[14px]" strokeWidth={1.9} /> Edit
            </button>
            <ConfirmDialog
              action={(data.archived ? restoreMasterCost : archiveMasterCost).bind(null, data.id)}
              heading={data.archived ? `Restore ${data.name}?` : `Archive ${data.name}?`}
              body={
                data.archived
                  ? "It will reappear in lists and pickers, and its cost will count again wherever it's referenced."
                  : "It will be hidden from lists and pickers, and its cost will drop out live wherever it's referenced."
              }
              detail={data.archived ? undefined : () => getMasterCostImpact(data.id).then((i) => <CostImpact impact={i} />)}
              wide={!data.archived}
              confirmLabel={data.archived ? "Restore" : "Archive"}
              tone={data.archived ? "neutral" : "danger"}
              icon={data.archived ? "restore" : "archive"}
              toastMessage={data.archived ? "Cost item restored" : "Cost item archived"}
              onConfirmed={() => {
                onChanged();
                onClose();
              }}
              triggerTitle={data.archived ? "Restore" : "Archive"}
              triggerClassName="btn-ghost btn-sm"
            >
              {data.archived ? <RotateCcw className="h-[14px] w-[14px]" strokeWidth={1.9} /> : <Archive className="h-[14px] w-[14px]" strokeWidth={1.9} />}
              {data.archived ? "Restore" : "Archive"}
            </ConfirmDialog>
          </div>
        )}
      </div>

      <DrawerBody>
        {!data ? (
          <DrawerSkeleton />
        ) : (
          <>
            <div className="mb-5 rounded-xl px-4 py-4" style={{ background: "oklch(0.97 0.004 250)" }}>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-500">Current cost</div>
              <div className="mt-1 font-mono text-[26px] font-bold tracking-[-0.02em] text-ink-900">
                {formatCurrency(data.currentCost, data.currency)}
                <span className="text-[14px] font-medium text-ink-400"> /{data.unit}</span>
              </div>
              <div className="mt-1 text-[12px] text-ink-500">
                {data.usedInTemplates > 0 ? `Used in ${data.usedInTemplates} template${data.usedInTemplates > 1 ? "s" : ""}.` : "Not used in any template."}
                {data.archived && " · Archived"}
              </div>
            </div>

            <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">Price history</div>
            <div className="flex flex-col">
              {data.history.map((h, i) => {
                const diff = h.oldValue != null ? h.newValue - h.oldValue : null;
                const isLast = i === data.history.length - 1;
                const up = (diff ?? 0) > 0;
                return (
                  <div key={h.id} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={
                          i === 0
                            ? { background: GREEN, boxShadow: "0 0 0 3px oklch(0.955 0.025 168)" }
                            : { background: "oklch(0.8 0.02 168)" }
                        }
                      />
                      {!isLast && <span className="my-1 w-px flex-1" style={{ background: "var(--border)" }} />}
                    </div>
                    <div className={isLast ? "flex-1" : "flex-1 pb-5"}>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[15px] font-bold tracking-[-0.01em] text-ink-900">
                          {formatCurrency(h.newValue, data.currency)}
                        </span>
                        {diff != null && diff !== 0 ? (
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold"
                            style={
                              up
                                ? { color: "oklch(0.55 0.14 40)", background: "oklch(0.96 0.03 40)" }
                                : { color: GREEN, background: "oklch(0.955 0.025 168)" }
                            }
                          >
                            {up ? "+" : "−"}
                            {formatCurrency(Math.abs(diff), data.currency)}
                          </span>
                        ) : (
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-700"
                            style={{ background: "oklch(0.955 0.025 168)" }}
                          >
                            Initial
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-[10.5px] text-ink-400">
                        {formatRelativeShort(h.at)} · {h.by}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

// ---- CSV import ------------------------------------------------------------
const TEMPLATE_CSV = `name,type,unit,cost,category
Brass Ingot,raw_material,kg,720,Metal
Chrome Plating,service,piece,45,Finishing
Aerator,component,piece,12,Fittings`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const REQUIRED_COLS = ["name", "type", "unit", "cost"];

function CostImportDrawer({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [result, action] = useActionState<ImportResult | undefined, FormData>(importMasterCostsCsv, undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (result?.ok && result.imported > 0) {
      toast(`Imported ${result.imported} cost item${result.imported > 1 ? "s" : ""}`);
      onImported();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      toast("Please choose a .csv file");
      return;
    }
    // Mirror the dropped/selected file onto the hidden input so the form submits it.
    const dt = new DataTransfer();
    dt.items.add(f);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFile(f);
  }

  const templateHref = "data:text/csv;charset=utf-8," + encodeURIComponent(TEMPLATE_CSV);
  const done = (result?.imported ?? 0) > 0;

  return (
    <Drawer open onClose={onClose} width={480}>
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <DrawerHeader onClose={onClose}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <Upload className="h-[19px] w-[19px]" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">Import price list</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-500">Bulk-add cost items from a spreadsheet</p>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody>
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose or drop a CSV file"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="group cursor-pointer rounded-2xl border-2 border-dashed px-6 py-8 text-center outline-none transition-all duration-200"
              style={
                dragging
                  ? { borderColor: "oklch(0.5 0.09 168)", background: "oklch(0.97 0.015 168)" }
                  : file
                    ? { borderColor: "oklch(0.89 0.04 170)", background: "oklch(0.98 0.008 168)" }
                    : { borderColor: "var(--border)", background: "oklch(0.985 0.003 250)" }
              }
            >
              {file ? (
                <div className="flex animate-fade-in items-center gap-3 text-left">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-soft ring-1 ring-brand-100">
                    <FileText className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink-900" title={file.name}>{file.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-500">
                      {formatBytes(file.size)} · ready to import
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Remove file"
                    onClick={(e) => {
                      e.stopPropagation();
                      pickFile(null);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition-colors hover:bg-ink-100"
                  >
                    <X className="h-[16px] w-[16px]" strokeWidth={2.2} />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-soft ring-1 ring-ink-100 transition-transform duration-200 group-hover:-translate-y-0.5"
                  >
                    <UploadCloud className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div className="mt-3 text-[14px] font-semibold text-ink-800">
                    Drag &amp; drop your CSV
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-500">
                    or <span className="font-semibold text-brand-600">click to browse</span>
                  </div>
                  <div className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
                    .csv files only
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                name="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Required columns + template */}
            <div className="rounded-xl border border-[var(--border)] bg-ink-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-500">
                  Required columns
                </span>
                <a
                  href={templateHref}
                  download="master-costs-template.csv"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  <Download className="h-3.5 w-3.5" /> Template
                </a>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {REQUIRED_COLS.map((c) => (
                  <code
                    key={c}
                    className="rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-ink-700"
                  >
                    {c}
                  </code>
                ))}
                <code className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-400">
                  category
                  <span className="text-[9px] uppercase tracking-[0.05em]">opt</span>
                </code>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                Invalid rows are reported by line number; valid rows still import.
              </p>
            </div>

            {/* Results */}
            {result && (result.imported > 0 || result.errors.length > 0) && (
              <div className="animate-fade-up space-y-3">
                {result.imported > 0 && (
                  <div
                    className="flex items-center gap-2 rounded-[10px] px-4 py-3 text-[13px] font-medium"
                    style={{ background: "oklch(0.955 0.025 168)", color: GREEN }}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Imported {result.imported} cost item{result.imported > 1 ? "s" : ""}.
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div
                    className="rounded-[10px] px-4 py-3 text-[13px]"
                    style={{ background: "oklch(0.96 0.03 40)", color: "oklch(0.5 0.16 30)" }}
                  >
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {result.errors.length} row(s) skipped
                    </div>
                    <ul className="ml-6 list-disc space-y-0.5">
                      {result.errors.map((e, i) => (
                        <li key={i}>
                          Line {e.line}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </DrawerBody>

        <DrawerFooter>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {done ? "Done" : "Cancel"}
          </button>
          <SubmitButton pendingText="Importing…" disabled={!file}>
            <Upload className="h-4 w-4" /> Import CSV
          </SubmitButton>
        </DrawerFooter>
      </form>
    </Drawer>
  );
}
