"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Inbox, ChevronRight } from "lucide-react";
import { EmptyState, Badge } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/utils";
import { searchRequests, type RequestListItem } from "@/server/actions/request-actions";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE } from "@/lib/request-status";
import { ReviewDrawer } from "./review-drawer";
import type { ProductOption } from "../sales/sales-drawers";

const GRID = "1.7fr 0.7fr 1fr 1.1fr 0.9fr 40px";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "CHANGES_REQUESTED", label: "Changes requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
];

export function RequestsBrowser({
  initialItems,
  products,
  currency,
  editable,
  initialQuery,
  initialStatus,
}: {
  initialItems: RequestListItem[];
  products: ProductOption[];
  currency: string;
  editable: boolean;
  initialQuery: string;
  initialStatus: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const firstRender = useRef(true);
  const reqId = useRef(0);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchRequests({ q, status });
      if (id === reqId.current) {
        setItems(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, status]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status && status !== "OPEN") params.set("status", status);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/requests?${qs}` : "/requests");
  }, [q, status]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchRequests({ q, status });
    if (id === reqId.current) setItems(rows);
  }

  const filtered = Boolean(q || (status && status !== "OPEN"));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setStatus(t.value)}
            className={`seg ${status === t.value ? "seg-on" : "seg-off"}`}
          >
            {t.label}
          </button>
        ))}
        <div className="search-box ml-auto w-[240px]">
          {loading ? (
            <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin text-brand-500" />
          ) : (
            <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, product, SKU" autoComplete="off" />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title={filtered ? "No requests match your filters" : "No order requests yet"}
          description={
            filtered
              ? "Try a different search term or status filter."
              : "When a portal buyer submits an order request, it lands here for review."
          }
        />
      ) : (
        <div className={`card overflow-hidden p-0 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
          <div
            className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <span>Customer</span>
            <span className="text-right">Items</span>
            <span className="text-right">Value</span>
            <span>Status</span>
            <span>Submitted</span>
            <span />
          </div>

          {items.map((r) => {
            const approved = r.status === "APPROVED";
            const value = approved ? (r.approvedTotal ?? 0) : r.requestedTotal;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(r.id)}
                className="grid w-full items-center gap-3 border-b border-[var(--border)] px-[22px] py-[14px] text-left transition-colors last:border-0 hover:bg-ink-50/60"
                style={{ gridTemplateColumns: GRID }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold text-ink-900">{r.customerName}</span>
                  {r.buyerName && <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">{r.buyerName}</span>}
                </span>
                <span className="text-right font-mono text-[13px] text-ink-700">{r.itemCount}</span>
                <span className="text-right font-mono text-[13px] font-semibold text-ink-900">{formatMoney(value, currency)}</span>
                <span>
                  <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                </span>
                <span className="font-mono text-[12px] text-ink-500">
                  {r.submittedAt ? formatDate(r.submittedAt) : formatDate(r.createdAt)}
                </span>
                <span className="flex justify-end">
                  <ChevronRight className="h-4 w-4 text-ink-300" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ReviewDrawer
        requestId={openId}
        products={products}
        currency={currency}
        editable={editable}
        onClose={() => setOpenId(null)}
        onChanged={refetch}
      />
    </>
  );
}
