"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, XCircle, Loader2, Pencil, Plus, Minus, Trash2, Send, X, Check, MessageSquare, RotateCcw } from "lucide-react";
import {
  cancelOrderRequest,
  editOrderRequest,
  postBuyerNote,
  type RequestView,
  type CatalogProduct,
} from "@/server/actions/buyer-actions";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from "@/lib/request-status";
import { Badge } from "@/components/ui";
import { NoteThread, NoteComposer } from "@/components/note-thread";
import { toast } from "@/components/toaster";
import { cn } from "@/lib/utils";

const CANCELLABLE = new Set(["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"]);
// A buyer may revise line items while a request is still open.
const EDITABLE = CANCELLABLE;

function useMoney(currency: string) {
  return useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }),
    [currency],
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function MyRequests({
  initial,
  currency,
  catalog,
}: {
  initial: RequestView[];
  currency: string;
  catalog: CatalogProduct[];
}) {
  const money = useMoney(currency);
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    const res = await cancelOrderRequest(id);
    setBusy(null);
    if (res?.error) return toast(res.error);
    toast("Request cancelled");
    router.refresh();
  }

  async function sendNote(id: string, text: string) {
    const res = await postBuyerNote(id, text);
    if (res?.error) {
      toast(res.error);
      return res;
    }
    router.refresh();
    return res;
  }

  return (
    <div className="space-y-3">
      {initial.map((r) => {
        const open = openId === r.id;
        const approved = r.status === "APPROVED";
        const editing = editingId === r.id;
        return (
          <div key={r.id} className="card overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-ink-50/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                  <span className="font-mono text-[11px] text-ink-400">
                    {r.items.filter((i) => !i.removed).length} item{r.items.length !== 1 ? "s" : ""}
                  </span>
                  {r.notes.length > 0 && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-400">
                      <MessageSquare className="h-3 w-3" /> {r.notes.length}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] text-ink-500">
                  Submitted {r.submittedAt ? fmtDate(r.submittedAt) : fmtDate(r.createdAt)}
                  {r.decidedAt && ` · Decided ${fmtDate(r.decidedAt)}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-bold text-ink-900">
                  {money.format(approved ? (r.approvedTotal ?? 0) : r.requestedTotal)}
                </div>
                <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">
                  {approved ? "approved" : "requested"}
                </div>
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
              <div className="border-t border-ink-100 px-5 py-4">
                {editing ? (
                  <RequestEditor
                    request={r}
                    catalog={catalog}
                    currency={currency}
                    onDone={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="mb-4 rounded-[12px] bg-ink-50/70 px-4 py-3.5">
                      <RequestTimeline r={r} />
                    </div>

                    {r.status === "CHANGES_REQUESTED" && (
                      <div className="mb-4 flex items-start gap-2.5 rounded-[10px] bg-watch-50 px-3.5 py-2.5 text-[12.5px] text-watch-500 ring-1 ring-inset ring-watch-500/15">
                        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Your supplier asked for changes. Use <span className="font-semibold">Edit request</span> below to
                          revise quantities or products, then resubmit.
                        </span>
                      </div>
                    )}

                    <div className="grid gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400" style={{ gridTemplateColumns: "1fr 120px 120px" }}>
                      <span>Product</span>
                      <span className="text-right">Requested</span>
                      <span className="text-right">{approved ? "Approved" : ""}</span>
                    </div>
                    <div className="mt-1 space-y-1.5">
                      {r.items.map((it) => (
                        <div
                          key={it.id}
                          className={cn("grid items-center gap-1.5 text-[13px]", it.removed && "opacity-50")}
                          style={{ gridTemplateColumns: "1fr 120px 120px" }}
                        >
                          <div className="min-w-0">
                            <div className={cn("truncate font-medium text-ink-800", it.removed && "line-through")}>{it.productName}</div>
                            <div className="font-mono text-[10.5px] text-ink-400">{it.sku}</div>
                          </div>
                          <div className="text-right text-ink-600">
                            {it.requestedQty != null
                              ? `${it.requestedQty} × ${money.format(it.requestedUnitPrice ?? 0)}`
                              : "—"}
                          </div>
                          <div className="text-right font-semibold text-ink-900">
                            {approved
                              ? it.removed
                                ? "Removed"
                                : `${it.approvedQty} × ${money.format(it.approvedUnitPrice ?? 0)}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Conversation */}
                    <div className="mt-5 border-t border-ink-100 pt-4">
                      <div className="mb-2.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-500">
                        Messages
                      </div>
                      <NoteThread notes={r.notes} viewpoint="BUYER" otherLabel="Supplier" />
                      <NoteComposer onSend={(t) => sendNote(r.id, t)} placeholder="Reply to your supplier…" className="mt-3" />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {EDITABLE.has(r.status) && (
                        <button
                          type="button"
                          onClick={() => setEditingId(r.id)}
                          className="btn-ghost"
                        >
                          <Pencil className="h-4 w-4" /> Edit request
                        </button>
                      )}
                      {CANCELLABLE.has(r.status) && (
                        <button
                          type="button"
                          onClick={() => cancel(r.id)}
                          disabled={busy === r.id}
                          className="btn-ghost text-risk-500 hover:bg-risk-50"
                        >
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Cancel request
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Status timeline -------------------------------------------------------

type StepState = "done" | "active" | "alert" | "error" | "todo" | "muted";
interface Step {
  label: string;
  state: StepState;
  at?: string | null;
}

/** Derive the lifecycle stepper for a request from its status + timestamps. */
function timelineSteps(r: RequestView): Step[] {
  const submitted: Step = { label: "Submitted", state: "done", at: r.submittedAt ?? r.createdAt };
  switch (r.status) {
    case "CANCELLED":
      return [submitted, { label: "Cancelled", state: "muted" }];
    case "CHANGES_REQUESTED":
      return [submitted, { label: "Changes requested", state: "alert" }, { label: "Approval", state: "todo" }];
    case "APPROVED":
      return [submitted, { label: "Reviewed", state: "done" }, { label: "Approved", state: "done", at: r.decidedAt }];
    case "REJECTED":
      return [submitted, { label: "Reviewed", state: "done" }, { label: "Rejected", state: "error", at: r.decidedAt }];
    default: // SUBMITTED / UNDER_REVIEW / DRAFT
      return [submitted, { label: "Under review", state: "active" }, { label: "Approval", state: "todo" }];
  }
}

function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-600 text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </div>
    );
  if (state === "error")
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-risk-500 text-white">
        <X className="h-3 w-3" strokeWidth={3} />
      </div>
    );
  if (state === "alert")
    return <div className="h-[18px] w-[18px] rounded-full bg-watch-500 ring-4 ring-inset ring-watch-50" />;
  if (state === "active")
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-brand-500 bg-white">
        <div className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-500" />
      </div>
    );
  if (state === "muted") return <div className="h-[18px] w-[18px] rounded-full bg-ink-200" />;
  return <div className="h-[18px] w-[18px] rounded-full border-2 border-ink-300 bg-white" />; // todo
}

function RequestTimeline({ r }: { r: RequestView }) {
  const steps = timelineSteps(r);
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const reached = s.state === "done"; // connector after a completed step is "filled"
        return (
          <div key={i} className={cn("flex items-start", i < steps.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <StepDot state={s.state} />
              <div className="text-center leading-tight">
                <div
                  className={cn(
                    "whitespace-nowrap text-[10.5px] font-semibold",
                    s.state === "todo" || s.state === "muted" ? "text-ink-400" : "text-ink-700",
                  )}
                >
                  {s.label}
                </div>
                {s.at && <div className="font-mono text-[9px] text-ink-400">{fmtDate(s.at)}</div>}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("mx-1 mt-[8px] h-[2px] flex-1 rounded-full", reached ? "bg-brand-300" : "bg-ink-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// One editable line in the buyer's revise view.
type EditLine = { productId: string; qty: number };

/** Inline editor letting the buyer revise line items and resubmit for review. */
function RequestEditor({
  request,
  catalog,
  currency,
  onDone,
  onCancel,
}: {
  request: RequestView;
  catalog: CatalogProduct[];
  currency: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const money = useMoney(currency);
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);

  // Seed from the request's live requested lines (drop staff-removed ones).
  const [lines, setLines] = useState<EditLine[]>(() =>
    request.items
      .filter((it) => !it.removed && it.requestedQty != null && byId.has(it.productId))
      .map((it) => ({ productId: it.productId, qty: it.requestedQty! })),
  );
  const [addId, setAddId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inCart = new Set(lines.map((l) => l.productId));
  const addable = catalog.filter((p) => !inCart.has(p.id));
  const total = lines.reduce((s, l) => s + (byId.get(l.productId)?.sellingPrice ?? 0) * l.qty, 0);

  function setQty(id: string, qty: number) {
    setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, qty: Math.max(0, qty) } : l)));
  }
  function bump(id: string, delta: number) {
    setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l)));
  }
  function remove(id: string) {
    setLines((ls) => ls.filter((l) => l.productId !== id));
  }
  function add(id: string) {
    if (!id || inCart.has(id)) return;
    setLines((ls) => [...ls, { productId: id, qty: 1 }]);
    setAddId("");
  }

  async function save() {
    setError(null);
    const clean = lines.filter((l) => l.qty > 0);
    if (clean.length === 0) return setError("Keep at least one product with a quantity.");
    setSaving(true);
    const fd = new FormData();
    fd.set("id", request.id);
    fd.set("buyerNote", note);
    fd.set("items", JSON.stringify(clean.map((l) => ({ productId: l.productId, quantity: l.qty }))));
    const res = await editOrderRequest(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast("Request updated & resubmitted");
    onDone();
  }

  return (
    <div>
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-500">Revise your request</div>
      <div className="space-y-2">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          return (
            <div key={l.productId} className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink-800">{p?.name ?? "Unknown product"}</div>
                <div className="font-mono text-[10.5px] text-ink-400">
                  {p ? `${money.format(p.sellingPrice)} · ${p.sku}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => bump(l.productId, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  className="input h-8 w-14 px-1 text-center"
                  type="number"
                  min="0"
                  step="any"
                  value={l.qty}
                  onChange={(e) => setQty(l.productId, Number(e.target.value))}
                />
                <button type="button" onClick={() => bump(l.productId, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(l.productId)} title="Remove" className="shrink-0 pl-1 text-ink-300 transition-colors hover:text-risk-500">
                  <Trash2 className="h-[15px] w-[15px]" />
                </button>
              </div>
            </div>
          );
        })}
        {lines.length === 0 && <p className="text-[12.5px] text-ink-400">All products removed — add at least one below.</p>}
      </div>

      {addable.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select className="input flex-1" value={addId} onChange={(e) => add(e.target.value)}>
            <option value="">Add a product…</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.sku} · {money.format(p.sellingPrice)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-500">Est. total</span>
        <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink-900">{money.format(total)}</span>
      </div>

      <div className="mt-3">
        <label className="label">Note to supplier (optional)</label>
        <textarea
          className="input min-h-[56px] resize-y"
          placeholder="Explain what you changed…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-risk-500">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? "Saving…" : "Save & resubmit"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
