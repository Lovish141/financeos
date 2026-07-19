"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, XCircle, Loader2 } from "lucide-react";
import { cancelOrderRequest, type RequestView } from "@/server/actions/buyer-actions";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from "@/lib/request-status";
import { Badge } from "@/components/ui";
import { toast } from "@/components/toaster";
import { cn } from "@/lib/utils";

const CANCELLABLE = new Set(["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"]);

function useMoney(currency: string) {
  return useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }),
    [currency],
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function MyRequests({ initial, currency }: { initial: RequestView[]; currency: string }) {
  const money = useMoney(currency);
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    const res = await cancelOrderRequest(id);
    setBusy(null);
    if (res?.error) return toast(res.error);
    toast("Request cancelled");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {initial.map((r) => {
        const open = openId === r.id;
        const approved = r.status === "APPROVED";
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
                {r.reviewNote && (
                  <div className="mb-3 rounded-[10px] bg-watch-50 px-3.5 py-2.5 text-[12.5px] text-watch-500 ring-1 ring-inset ring-watch-500/15">
                    <span className="font-semibold">Note from supplier:</span> {r.reviewNote}
                  </div>
                )}
                {r.buyerNote && (
                  <div className="mb-3 text-[12.5px] text-ink-500">
                    <span className="font-semibold text-ink-600">Your note:</span> {r.buyerNote}
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

                {CANCELLABLE.has(r.status) && (
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    disabled={busy === r.id}
                    className="btn-ghost mt-4 text-risk-500 hover:bg-risk-50"
                  >
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Cancel request
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
