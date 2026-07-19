"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Check, RotateCcw, X } from "lucide-react";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerSkeleton } from "@/components/drawer";
import { Badge } from "@/components/ui";
import { toast } from "@/components/toaster";
import { formatMoney, formatDate } from "@/lib/utils";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from "@/lib/request-status";
import {
  getRequestDetail,
  approveRequest,
  rejectRequest,
  requestChanges,
  type RequestDetail,
} from "@/server/actions/request-actions";
import type { ProductOption } from "../sales/sales-drawers";
import type { OrderRequestStatus } from "@prisma/client";

const OPEN: OrderRequestStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];

// One editable approval line. `itemId` links back to the buyer's requested line;
// absent for a staff-added line.
type EditLine = { key: string; itemId?: string; productId: string; quantity: string; unitPrice: string };

let keySeq = 0;
const nextKey = () => `l${keySeq++}`;

export function ReviewDrawer({
  requestId,
  products,
  currency,
  editable,
  onClose,
  onChanged,
}: {
  requestId: string | null;
  products: ProductOption[];
  currency: string;
  editable: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject" | "changes">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    setDetail(null);
    setError(null);
    setNote("");
    setLoading(true);
    getRequestDetail(requestId).then((res) => {
      setLoading(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDetail(res);
      // Seed the editor from the buyer's requested lines.
      setLines(
        res.items
          .filter((it) => !it.removed)
          .map((it) => ({
            key: nextKey(),
            itemId: it.id,
            productId: it.productId,
            quantity: it.requestedQty != null ? String(it.requestedQty) : "",
            unitPrice: it.requestedUnitPrice != null ? String(it.requestedUnitPrice) : "",
          })),
      );
    });
  }, [requestId]);

  const open = requestId != null;
  const isOpenStatus = detail != null && OPEN.includes(detail.status);
  const canAct = editable && isOpenStatus;

  function patch(key: string, p: Partial<EditLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }
  function onProduct(key: string, id: string) {
    const p = products.find((x) => x.id === id);
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const unitPrice = l.unitPrice.trim() === "" && p ? String(p.sellingPrice) : l.unitPrice;
        return { ...l, productId: id, unitPrice };
      }),
    );
  }
  function addLine() {
    const p = products[0];
    setLines((ls) => [...ls, { key: nextKey(), productId: p?.id ?? "", quantity: "", unitPrice: p ? String(p.sellingPrice) : "" }]);
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const approveTotal = lines.reduce((s, l) => {
    const q = parseFloat(l.quantity);
    const pr = parseFloat(l.unitPrice);
    return s + (q > 0 && pr >= 0 ? q * pr : 0);
  }, 0);

  async function approve() {
    setError(null);
    if (lines.length === 0) return setError("An approved order needs at least one line.");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.productId) return setError(`Pick a product for line ${i + 1}.`);
      if (!(parseFloat(l.quantity) > 0)) return setError(`Quantity for line ${i + 1} must be greater than 0.`);
      if (!(parseFloat(l.unitPrice) >= 0)) return setError(`Unit price for line ${i + 1} must be 0 or more.`);
    }
    setBusy("approve");
    const fd = new FormData();
    fd.set("id", detail!.id);
    fd.set(
      "items",
      JSON.stringify(
        lines.map((l) => ({ itemId: l.itemId, productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      ),
    );
    const res = await approveRequest(undefined, fd);
    setBusy(null);
    if (res?.error) return setError(res.error);
    toast("Request approved & sale booked");
    onChanged();
    onClose();
  }

  async function decide(kind: "reject" | "changes") {
    setError(null);
    if (kind === "changes" && !note.trim()) return setError("Add a note so the buyer knows what to change.");
    setBusy(kind);
    const res = await (kind === "reject" ? rejectRequest : requestChanges)(detail!.id, note.trim() || undefined);
    setBusy(null);
    if (res?.error) return setError(res.error);
    toast(kind === "reject" ? "Request rejected" : "Sent back to buyer");
    onChanged();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} width={620}>
      <DrawerHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">
            {detail ? detail.customerName : "Order request"}
          </h3>
          {detail && <Badge tone={REQUEST_STATUS_TONE[detail.status]}>{REQUEST_STATUS_LABEL[detail.status]}</Badge>}
        </div>
        {detail && (
          <p className="mt-1 text-[12.5px] text-ink-500">
            {detail.buyerName ?? detail.buyerEmail ?? "Buyer"} ·{" "}
            {detail.submittedAt ? `Submitted ${formatDate(detail.submittedAt)}` : `Created ${formatDate(detail.createdAt)}`}
          </p>
        )}
      </DrawerHeader>

      <DrawerBody>
        {loading || !detail ? (
          error ? (
            <p className="text-sm text-risk-500">{error}</p>
          ) : (
            <DrawerSkeleton rows={4} />
          )
        ) : (
          <div className="space-y-4">
            {detail.buyerNote && (
              <div className="rounded-[10px] bg-ink-50 px-4 py-3 text-[13px] text-ink-600">
                <span className="font-semibold text-ink-700">Buyer note:</span> {detail.buyerNote}
              </div>
            )}

            {canAct ? (
              <>
                <div>
                  <label className="label">Approved lines</label>
                  <p className="-mt-1 mb-2 text-[11.5px] text-ink-400">
                    Adjust quantities and pricing, drop lines, or add products. This is what gets booked.
                  </p>
                  <div className="space-y-2">
                    <div className="grid gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400" style={{ gridTemplateColumns: "1fr 66px 90px 30px" }}>
                      <span>Product</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Price</span>
                      <span />
                    </div>
                    {lines.map((l) => {
                      const orig = l.itemId ? detail.items.find((it) => it.id === l.itemId) : undefined;
                      return (
                        <div key={l.key}>
                          <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 66px 90px 30px" }}>
                            <select className="input" value={l.productId} onChange={(e) => onProduct(l.key, e.target.value)}>
                              {products.length === 0 && <option value="">No products</option>}
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>
                              ))}
                            </select>
                            <input className="input px-2 text-right" type="number" step="any" min="0" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} placeholder="0" />
                            <input className="input px-2 text-right" type="number" step="0.01" min="0" value={l.unitPrice} onChange={(e) => patch(l.key, { unitPrice: e.target.value })} placeholder="0" />
                            <button type="button" title="Remove line" onClick={() => removeLine(l.key)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-risk-500">
                              <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                            </button>
                          </div>
                          {orig && orig.requestedQty != null && (
                            <div className="mt-0.5 pl-1 font-mono text-[10px] text-ink-400">
                              requested {orig.requestedQty} × {formatMoney(orig.requestedUnitPrice ?? 0, currency)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={addLine} disabled={products.length === 0} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-40">
                    <Plus className="h-3.5 w-3.5" /> Add product
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-[10px] px-4 py-3" style={{ background: "oklch(0.955 0.025 168)" }}>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "oklch(0.48 0.08 168)" }}>Order total on approval</span>
                  <span className="font-mono text-[19px] font-bold tracking-[-0.02em]" style={{ color: "oklch(0.48 0.08 168)" }}>
                    {formatMoney(approveTotal, currency)}
                  </span>
                </div>

                <div>
                  <label className="label">Note to buyer (optional for approve, required to send back)</label>
                  <textarea className="input min-h-[64px] resize-y" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain any pricing or quantity changes…" />
                </div>
              </>
            ) : (
              <ReadOnlyDiff detail={detail} currency={currency} />
            )}

            {error && <p className="text-sm text-risk-500">{error}</p>}
          </div>
        )}
      </DrawerBody>

      {canAct && (
        <DrawerFooter className="justify-between">
          <button type="button" className="btn-ghost text-risk-500 hover:bg-risk-50" onClick={() => decide("reject")} disabled={busy != null}>
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
          </button>
          <div className="flex gap-2.5">
            <button type="button" className="btn-ghost" onClick={() => decide("changes")} disabled={busy != null}>
              {busy === "changes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Request changes
            </button>
            <button type="button" className="btn-primary" onClick={approve} disabled={busy != null || lines.length === 0}>
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve &amp; book
            </button>
          </div>
        </DrawerFooter>
      )}
    </Drawer>
  );
}

function ReadOnlyDiff({ detail, currency }: { detail: RequestDetail; currency: string }) {
  const approved = detail.status === "APPROVED";
  return (
    <div>
      {detail.reviewNote && (
        <div className="mb-3 rounded-[10px] bg-watch-50 px-4 py-3 text-[13px] text-watch-500 ring-1 ring-inset ring-watch-500/15">
          <span className="font-semibold">Review note:</span> {detail.reviewNote}
        </div>
      )}
      <div className="grid gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400" style={{ gridTemplateColumns: "1fr 120px 120px" }}>
        <span>Product</span>
        <span className="text-right">Requested</span>
        <span className="text-right">{approved ? "Approved" : ""}</span>
      </div>
      <div className="mt-1 space-y-1.5">
        {detail.items.map((it) => (
          <div key={it.id} className={`grid items-center gap-1.5 text-[13px] ${it.removed ? "opacity-50" : ""}`} style={{ gridTemplateColumns: "1fr 120px 120px" }}>
            <div className="min-w-0">
              <div className={`truncate font-medium text-ink-800 ${it.removed ? "line-through" : ""}`}>{it.productName}</div>
              <div className="font-mono text-[10.5px] text-ink-400">{it.sku}</div>
            </div>
            <div className="text-right text-ink-600">
              {it.requestedQty != null ? `${it.requestedQty} × ${formatMoney(it.requestedUnitPrice ?? 0, currency)}` : "—"}
            </div>
            <div className="text-right font-semibold text-ink-900">
              {approved ? (it.removed ? "Removed" : `${it.approvedQty} × ${formatMoney(it.approvedUnitPrice ?? 0, currency)}`) : ""}
            </div>
          </div>
        ))}
      </div>
      {approved && detail.approvedTotal != null && (
        <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500">Booked total</span>
          <span className="font-mono text-[16px] font-bold text-ink-900">{formatMoney(detail.approvedTotal, currency)}</span>
        </div>
      )}
    </div>
  );
}
