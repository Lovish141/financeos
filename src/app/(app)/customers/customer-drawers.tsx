"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Loader2, Archive, RotateCcw, Mail, Phone, MapPin, Building2 } from "lucide-react";
import { Drawer, DrawerBody, DrawerCloseButton, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";
import { formatCurrency, formatDate } from "@/lib/utils";
import { validateEmail, validatePhone, validateGstin } from "@/lib/validation";
import { PortalAccessPanel } from "./customer-portal-panel";
import {
  createCustomer,
  updateCustomer,
  archiveCustomer,
  restoreCustomer,
  getCustomerDetail,
  type CustomerListItem,
  type CustomerDetail,
} from "@/server/actions/customer-actions";

const CHANNELS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "EXPORT", label: "Export" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));

export type CustomerInitial = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  channel: string | null;
  gstin: string | null;
  city: string | null;
  notes: string | null;
};

// ---- pub/sub (mirrors costs/cost-drawer.tsx) -------------------------------
type CustomerEvent =
  | { kind: "create" }
  | { kind: "edit"; initial: CustomerInitial }
  | { kind: "preview"; id: string };
const listeners = new Set<(e: CustomerEvent) => void>();
export function openCustomerCreate() {
  listeners.forEach((l) => l({ kind: "create" }));
}
export function openCustomerEdit(initial: CustomerInitial) {
  listeners.forEach((l) => l({ kind: "edit", initial }));
}
export function openCustomerPreview(id: string) {
  listeners.forEach((l) => l({ kind: "preview", id }));
}

const changeListeners = new Set<() => void>();
export function notifyCustomersChanged() {
  changeListeners.forEach((l) => l());
}
export function onCustomersChanged(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export function NewCustomerButton() {
  return (
    <button type="button" className="btn-primary" onClick={openCustomerCreate}>
      <Plus className="h-4 w-4" /> New customer
    </button>
  );
}
export function CustomerRowOpen({ id, className, title, children }: { id: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} className={className} onClick={() => openCustomerPreview(id)}>
      {children}
    </button>
  );
}
export function CustomerEditButton({ initial }: { initial: CustomerInitial }) {
  return (
    <button type="button" className="icon-btn" title="Edit" onClick={() => openCustomerEdit(initial)}>
      <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
    </button>
  );
}

// ---- controller ------------------------------------------------------------
function CustomerDrawersController({ editable }: { editable: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<CustomerEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const l = (e: CustomerEvent) => {
      setView(e);
      setOpen(true);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!editable || !searchParams.get("new")) return;
    setView({ kind: "create" });
    setOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const formOpen = open && (view?.kind === "create" || view?.kind === "edit");
  const previewOpen = open && view?.kind === "preview";

  return (
    <>
      <CustomerFormDrawer
        open={!!formOpen}
        mode={view?.kind === "edit" ? "edit" : "create"}
        initial={view?.kind === "edit" ? view.initial : undefined}
        onClose={() => setOpen(false)}
        onSaved={() => notifyCustomersChanged()}
      />
      <CustomerPreviewDrawer
        open={!!previewOpen}
        id={view?.kind === "preview" ? view.id : null}
        editable={editable}
        onClose={() => setOpen(false)}
        onEdit={(initial) => setView({ kind: "edit", initial })}
        onChanged={() => notifyCustomersChanged()}
      />
    </>
  );
}

export function CustomerDrawers({ editable }: { editable: boolean }) {
  return (
    <Suspense fallback={null}>
      <CustomerDrawersController editable={editable} />
    </Suspense>
  );
}

// ---- create / edit ---------------------------------------------------------
function CustomerFormDrawer({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: CustomerInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("");
  const [gstin, setGstin] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<"name" | "email" | "phone" | "gstin", string | null>>({
    name: null,
    email: null,
    phone: null,
    gstin: null,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({ name: null, email: null, phone: null, gstin: null });
    if (mode === "edit" && initial) {
      setName(initial.name);
      setEmail(initial.email ?? "");
      setPhone(initial.phone ?? "");
      setChannel(initial.channel ?? "");
      setGstin(initial.gstin ?? "");
      setCity(initial.city ?? "");
      setNotes(initial.notes ?? "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setChannel("");
      setGstin("");
      setCity("");
      setNotes("");
    }
  }, [open, mode, initial]);

  async function handleSave() {
    setError(null);

    const errs = {
      name: name.trim() ? null : "Name is required.",
      email: validateEmail(email),
      phone: validatePhone(phone),
      gstin: validateGstin(gstin),
    };
    setFieldErrors(errs);
    if (errs.name || errs.email || errs.phone || errs.gstin) return;

    setSaving(true);
    const fd = new FormData();
    if (mode === "edit" && initial) fd.set("id", initial.id);
    fd.set("name", name.trim());
    fd.set("email", email);
    fd.set("phone", phone);
    fd.set("channel", channel);
    fd.set("gstin", gstin);
    fd.set("city", city);
    fd.set("notes", notes);

    const res = await (mode === "create" ? createCustomer : updateCustomer)(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast(mode === "create" ? "Customer added" : "Customer updated");
    onSaved();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={452}>
      <DrawerHeader onClose={onClose}>
        <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
          {mode === "create" ? "New customer" : "Edit customer"}
        </h3>
      </DrawerHeader>

      <DrawerBody>
        <div className="space-y-4">
          <div>
            <label className="label">Customer name</label>
            <input
              className={`input ${fieldErrors.name ? "border-risk-500" : ""}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: null }));
              }}
              placeholder="e.g. Sharma Traders"
              autoFocus
            />
            {fieldErrors.name && <p className="mt-1 text-[12px] text-risk-500">{fieldErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email (optional)</label>
              <input
                className={`input ${fieldErrors.email ? "border-risk-500" : ""}`}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: null }));
                }}
                placeholder="name@company.com"
              />
              {fieldErrors.email && <p className="mt-1 text-[12px] text-risk-500">{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input
                className={`input ${fieldErrors.phone ? "border-risk-500" : ""}`}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: null }));
                }}
                placeholder="+91…"
              />
              {fieldErrors.phone && <p className="mt-1 text-[12px] text-risk-500">{fieldErrors.phone}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Channel (optional)</label>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">City (optional)</label>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
            </div>
          </div>
          <div>
            <label className="label">GSTIN (optional)</label>
            <input
              className={`input ${fieldErrors.gstin ? "border-risk-500" : ""}`}
              value={gstin}
              onChange={(e) => {
                setGstin(e.target.value);
                if (fieldErrors.gstin) setFieldErrors((p) => ({ ...p, gstin: null }));
              }}
              placeholder="27AAAAA0000A1Z5"
            />
            {fieldErrors.gstin && <p className="mt-1 text-[12px] text-risk-500">{fieldErrors.gstin}</p>}
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, contact person…" />
          </div>
          {error && <p className="text-sm text-risk-500">{error}</p>}
        </div>
      </DrawerBody>

      <DrawerFooter>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Create customer" : "Save changes"}
        </button>
      </DrawerFooter>
    </Drawer>
  );
}

// ---- preview ---------------------------------------------------------------
function CustomerPreviewDrawer({
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
  onEdit: (initial: CustomerInitial) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (!open || !id) return;
    let active = true;
    setData(null);
    getCustomerDetail(id).then((res) => {
      if (active) setData(res.ok ? (res as CustomerDetail) : null);
    });
    return () => {
      active = false;
    };
  }, [open, id]);

  const initial: CustomerInitial | null = data
    ? { id: data.id, name: data.name, email: data.email, phone: data.phone, channel: data.channel, gstin: data.gstin, city: data.city, notes: data.notes }
    : null;

  return (
    <Drawer open={open} onClose={onClose} width={480}>
      <div className="border-b border-[var(--border)] px-[26px] pb-[18px] pt-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {data && (data.channel || data.city) && (
              <div className="mb-2 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500">
                {data.channel && <span className="shrink-0">{CHANNEL_LABEL[data.channel] ?? data.channel}</span>}
                {data.channel && data.city && <span className="shrink-0">·</span>}
                {data.city && <span className="min-w-0 truncate" title={data.city}>{data.city}</span>}
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
              action={(data.archived ? restoreCustomer : archiveCustomer).bind(null, data.id)}
              heading={data.archived ? `Restore ${data.name}?` : `Archive ${data.name}?`}
              body={
                data.archived
                  ? "They will reappear in lists and the sale customer picker."
                  : "They will be hidden from lists and the sale picker. Existing sales keep their link."
              }
              confirmLabel={data.archived ? "Restore" : "Archive"}
              tone={data.archived ? "neutral" : "danger"}
              icon={data.archived ? "restore" : "archive"}
              toastMessage={data.archived ? "Customer restored" : "Customer archived"}
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
            <div className="mb-5 grid grid-cols-3 gap-3">
              <Stat label="Orders" value={data.orders.toLocaleString("en-IN")} />
              <Stat label="Units" value={data.unitsSold.toLocaleString("en-IN")} />
              <Stat label="Revenue" value={formatCurrency(data.revenue, data.currency)} accent />
            </div>

            {(data.email || data.phone || data.gstin) && (
              <div className="mb-5 space-y-2 rounded-xl border border-[var(--border)] p-4">
                {data.email && <ContactRow icon={<Mail className="h-3.5 w-3.5" />} text={data.email} />}
                {data.phone && <ContactRow icon={<Phone className="h-3.5 w-3.5" />} text={data.phone} />}
                {data.city && <ContactRow icon={<MapPin className="h-3.5 w-3.5" />} text={data.city} />}
                {data.gstin && <ContactRow icon={<Building2 className="h-3.5 w-3.5" />} text={data.gstin} />}
              </div>
            )}

            {data.notes && (
              <div className="mb-5 rounded-[10px] px-[13px] py-[11px] text-[12.5px] leading-relaxed text-ink-600" style={{ background: "oklch(0.97 0.004 250)" }}>
                {data.notes}
              </div>
            )}

            {editable && !data.archived && <PortalAccessPanel customerId={data.id} />}

            <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">Recent sales</div>
            {data.recent.length === 0 ? (
              <p className="text-[13px] text-ink-400">No sales recorded for this customer yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.recent.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink-900" title={s.productName}>{s.productName}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-ink-400">
                        {s.quantity.toLocaleString("en-IN")} × {formatCurrency(s.unitPrice, data.currency)} · {formatDate(s.soldAt)}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[13px] font-semibold text-ink-900">{formatCurrency(s.revenue, data.currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "oklch(0.97 0.004 250)" }}>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-500">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[16px] font-bold tracking-[-0.02em]" style={{ color: accent ? "oklch(0.46 0.08 168)" : "oklch(0.2 0.01 260)" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function ContactRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[12.5px] text-ink-700">
      <span className="text-ink-400">{icon}</span>
      <span className="min-w-0 truncate" title={text}>{text}</span>
    </div>
  );
}
