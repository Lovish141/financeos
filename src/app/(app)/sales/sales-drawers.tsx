"use client";

import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2, Upload, UploadCloud, FileText, X, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/drawer";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toaster";
import {
  createSale,
  updateSale,
  importSalesCsv,
  type ImportResult,
  type SaleListItem,
} from "@/server/actions/sales-actions";
import type { CustomerOption } from "@/server/actions/customer-actions";

const GREEN = "oklch(0.48 0.08 168)";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
}

const CHANNELS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "EXPORT", label: "Export" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

// ---- pub/sub (mirrors costs/cost-drawer.tsx) -------------------------------
type SaleEvent =
  | { kind: "create" }
  | { kind: "edit"; sale: SaleListItem }
  | { kind: "import" };
const listeners = new Set<(e: SaleEvent) => void>();
export function openSaleCreate() {
  listeners.forEach((l) => l({ kind: "create" }));
}
export function openSaleImport() {
  listeners.forEach((l) => l({ kind: "import" }));
}
export function openSaleEdit(sale: SaleListItem) {
  listeners.forEach((l) => l({ kind: "edit", sale }));
}

const changeListeners = new Set<() => void>();
export function notifySalesChanged() {
  changeListeners.forEach((l) => l());
}
export function onSalesChanged(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export function NewSaleButton() {
  return (
    <button type="button" className="btn-primary" onClick={openSaleCreate}>
      <Plus className="h-4 w-4" /> New sale
    </button>
  );
}
export function ImportSalesButton() {
  return (
    <button type="button" className="btn-ghost" onClick={openSaleImport}>
      <Upload className="h-4 w-4" /> Import CSV
    </button>
  );
}

// ---- controller ------------------------------------------------------------
function SalesDrawersController({ products, customers }: { products: ProductOption[]; customers: CustomerOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<SaleEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const l = (e: SaleEvent) => {
      setView(e);
      setOpen(true);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Deep link: /sales?new=1 opens the form, ?import=1 opens CSV import.
  useEffect(() => {
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
  const importOpen = open && view?.kind === "import";

  return (
    <>
      <SaleFormDrawer
        open={!!formOpen}
        products={products}
        customers={customers}
        mode={view?.kind === "edit" ? "edit" : "create"}
        initial={view?.kind === "edit" ? view.sale : undefined}
        onClose={() => setOpen(false)}
        onSaved={() => notifySalesChanged()}
      />
      {importOpen && <SaleImportDrawer onClose={() => setOpen(false)} onImported={() => notifySalesChanged()} />}
    </>
  );
}

export function SalesDrawers({ products, customers }: { products: ProductOption[]; customers: CustomerOption[] }) {
  return (
    <Suspense fallback={null}>
      <SalesDrawersController products={products} customers={customers} />
    </Suspense>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---- create / edit ---------------------------------------------------------
function SaleFormDrawer({
  open,
  products,
  customers,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  products: ProductOption[];
  customers: CustomerOption[];
  mode: "create" | "edit";
  initial?: SaleListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [soldAt, setSoldAt] = useState(todayISO());
  const [channel, setChannel] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && initial) {
      setProductId(initial.productId);
      setQuantity(String(initial.quantity));
      setUnitPrice(String(initial.unitPrice));
      setSoldAt(initial.soldAt.slice(0, 10));
      setChannel(initial.channel ?? "");
      setCustomerId(initial.customerId ?? "");
    } else {
      setProductId(products[0]?.id ?? "");
      setQuantity("");
      setUnitPrice(products[0] ? String(products[0].sellingPrice) : "");
      setSoldAt(todayISO());
      setChannel("");
      setCustomerId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial]);

  // Picking a customer defaults the channel to their usual one (create mode only).
  function onCustomerChange(id: string) {
    setCustomerId(id);
    if (mode === "create" && !channel) {
      const c = customers.find((x) => x.id === id);
      if (c?.channel) setChannel(c.channel);
    }
  }

  // When picking a product in create mode, default the price to its catalog price.
  function onProductChange(id: string) {
    setProductId(id);
    if (mode === "create") {
      const p = products.find((x) => x.id === id);
      if (p) setUnitPrice(String(p.sellingPrice));
    }
  }

  const selected = products.find((p) => p.id === productId);
  const qtyNum = parseFloat(quantity);
  const priceNum = parseFloat(unitPrice);
  const revenue = qtyNum > 0 && priceNum >= 0 ? qtyNum * priceNum : null;

  async function handleSave() {
    setError(null);
    if (!productId) return setError("Pick a product.");
    if (!(qtyNum > 0)) return setError("Quantity must be greater than 0.");
    if (!(priceNum >= 0)) return setError("Unit price must be 0 or more.");
    if (!soldAt) return setError("Sale date is required.");

    setSaving(true);
    const fd = new FormData();
    if (mode === "edit" && initial) fd.set("id", initial.id);
    fd.set("productId", productId);
    fd.set("quantity", quantity);
    fd.set("unitPrice", unitPrice);
    fd.set("soldAt", soldAt);
    fd.set("channel", channel);
    fd.set("customerId", customerId);

    const res = await (mode === "create" ? createSale : updateSale)(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast(mode === "create" ? "Sale recorded" : "Sale updated");
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={452}>
      <DrawerHeader onClose={onClose}>
        <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
          {mode === "create" ? "New sale" : "Edit sale"}
        </h3>
      </DrawerHeader>

      <DrawerBody>
        <div className="space-y-4">
          <div>
            <label className="label">Product</label>
            <select className="input" value={productId} onChange={(e) => onProductChange(e.target.value)} autoFocus>
              {products.length === 0 && <option value="">No products yet</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Realized unit price (₹)</label>
              <input className="input" type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sale date</label>
              <input className="input" type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
            </div>
            <div>
              <label className="label">Channel (optional)</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Customer (optional)</label>
            <select className="input" value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">— No customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {customers.length === 0 && (
              <p className="mt-1 text-[11px] text-ink-400">Add customers in the Customers section to link them here.</p>
            )}
          </div>

          {selected && priceNum >= 0 && priceNum !== selected.sellingPrice && (
            <div className="rounded-[10px] px-[13px] py-[11px] font-mono text-[11px] text-ink-500" style={{ background: "oklch(0.97 0.004 250)" }}>
              Catalog price is ₹{selected.sellingPrice}. You&apos;re recording a realized price of ₹{priceNum} — true margin will differ from the catalog margin.
            </div>
          )}
          {revenue != null && (
            <div className="rounded-[10px] px-4 py-3" style={{ background: "oklch(0.955 0.025 168)" }}>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: GREEN }}>Sale revenue</span>
              <div className="mt-0.5 font-mono text-[20px] font-bold tracking-[-0.02em]" style={{ color: GREEN }}>
                ₹{revenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-risk-500">{error}</p>}
        </div>
      </DrawerBody>

      <DrawerFooter>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || products.length === 0}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Record sale" : "Save changes"}
        </button>
      </DrawerFooter>
    </Drawer>
  );
}

// ---- CSV import ------------------------------------------------------------
const TEMPLATE_CSV = `sku,quantity,date,unit_price,channel,customer
MIX-BASIN-EL,120,2026-06-01,1420,retail,Sharma Traders
MIX-BASIN-PR,45,2026-06-03,1790,wholesale,Metro Sanitary
MIX-BASIN-EC,200,2026-06-05,999,online,`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const REQUIRED_COLS = ["sku", "quantity", "date", "unit_price"];

function SaleImportDrawer({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [result, action] = useActionState<ImportResult | undefined, FormData>(importSalesCsv, undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (result?.ok && result.imported > 0) {
      toast(`Imported ${result.imported} sale${result.imported > 1 ? "s" : ""}`);
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
              <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">Import sales</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-500">Bulk-add sale records from a spreadsheet</p>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody>
          <div className="space-y-4">
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
                    <div className="mt-0.5 font-mono text-[11px] text-ink-500">{formatBytes(file.size)} · ready to import</div>
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
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-soft ring-1 ring-ink-100 transition-transform duration-200 group-hover:-translate-y-0.5">
                    <UploadCloud className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div className="mt-3 text-[14px] font-semibold text-ink-800">Drag &amp; drop your CSV</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-500">
                    or <span className="font-semibold text-brand-600">click to browse</span>
                  </div>
                  <div className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">.csv files only</div>
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

            <div className="rounded-xl border border-[var(--border)] bg-ink-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-500">Required columns</span>
                <a
                  href={templateHref}
                  download="sales-template.csv"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  <Download className="h-3.5 w-3.5" /> Template
                </a>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {REQUIRED_COLS.map((c) => (
                  <code key={c} className="rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-ink-700">
                    {c}
                  </code>
                ))}
                {["channel", "customer"].map((c) => (
                  <code key={c} className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-400">
                    {c}
                    <span className="text-[9px] uppercase tracking-[0.05em]">opt</span>
                  </code>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                Match rows to products by SKU. Invalid rows are reported by line number; valid rows still import.
              </p>
            </div>

            {result && (result.imported > 0 || result.errors.length > 0) && (
              <div className="animate-fade-up space-y-3">
                {result.imported > 0 && (
                  <div className="flex items-center gap-2 rounded-[10px] px-4 py-3 text-[13px] font-medium" style={{ background: "oklch(0.955 0.025 168)", color: GREEN }}>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Imported {result.imported} sale{result.imported > 1 ? "s" : ""}.
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="rounded-[10px] px-4 py-3 text-[13px]" style={{ background: "oklch(0.96 0.03 40)", color: "oklch(0.5 0.16 30)" }}>
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {result.errors.length} row(s) skipped
                    </div>
                    <ul className="ml-6 list-disc space-y-0.5">
                      {result.errors.map((e, i) => (
                        <li key={i}>Line {e.line}: {e.error}</li>
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
