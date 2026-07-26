"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Trash2, Loader2, ShoppingCart, Pencil, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMoney, formatDate } from "@/lib/utils";
import { deleteOrder, searchOrders, type OrderListItem } from "@/server/actions/sales-actions";
import { NewSaleButton, openSaleEdit, onSalesChanged } from "./sales-drawers";
import type { SalesChannel } from "@prisma/client";

const GRID = "1.9fr 0.7fr 0.8fr 1fr 0.9fr 1fr 74px";

const CHANNEL_LABEL: Record<SalesChannel, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  DISTRIBUTOR: "Distributor",
  EXPORT: "Export",
  ONLINE: "Online",
  OTHER: "Other",
};
const CHANNEL_DOT: Record<SalesChannel, string> = {
  RETAIL: "oklch(0.55 0.12 250)",
  WHOLESALE: "oklch(0.52 0.11 300)",
  DISTRIBUTOR: "oklch(0.55 0.1 200)",
  EXPORT: "oklch(0.58 0.12 45)",
  ONLINE: "oklch(0.5 0.1 168)",
  OTHER: "oklch(0.6 0.02 260)",
};

const CHANNEL_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "EXPORT", label: "Export" },
  { value: "ONLINE", label: "Online" },
];

export function SalesBrowser({
  initialItems,
  currency,
  editable,
  initialQuery,
  initialChannel,
}: {
  initialItems: OrderListItem[];
  currency: string;
  editable: boolean;
  initialQuery: string;
  initialChannel: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [channel, setChannel] = useState(initialChannel);
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      const rows = await searchOrders({ q, channel });
      if (id === reqId.current) {
        setItems(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, channel]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (channel) params.set("channel", channel);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/sales?${qs}` : "/sales");
  }, [q, channel]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchOrders({ q, channel });
    if (id === reqId.current) setItems(rows);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSalesChanged(refetch), [q, channel]);

  const filtered = Boolean(q || channel);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CHANNEL_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setChannel(t.value)}
            className={`seg ${channel === t.value ? "seg-on" : "seg-off"}`}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, SKU, customer" autoComplete="off" />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-10 w-10" />}
          title={filtered ? "No sales match your filters" : "No sales recorded yet"}
          description={
            filtered
              ? "Try a different search term or channel filter."
              : "Record a sale to track realized revenue and true margin — or import a batch from a spreadsheet."
          }
          action={editable && !filtered && <NewSaleButton />}
        />
      ) : (
        <>
          <div className="mb-3 flex gap-3.5">
            <SummaryTile label="Orders shown" value={items.length.toLocaleString("en-IN")} />
            <SummaryTile label="Units sold" value={totalUnits.toLocaleString("en-IN")} />
            <SummaryTile label="Revenue" value={formatMoney(totalRevenue, currency)} accent />
          </div>

          <div className={`card overflow-hidden p-0 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
            <div
              className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
              style={{ gridTemplateColumns: GRID }}
            >
              <span>Sale</span>
              <span className="text-right">Items</span>
              <span className="text-right">Units</span>
              <span className="text-right">Revenue</span>
              <span>Channel</span>
              <span>Date</span>
              <span />
            </div>

            {items.map((o) => {
              const isOpen = expanded.has(o.id);
              const summary = o.items.map((it) => it.productName).join(", ");
              return (
                <div key={o.id} className="border-b border-[var(--border)] last:border-0">
                  <div
                    className="grid items-center gap-3 px-[22px] py-[14px] transition-colors hover:bg-ink-50/60"
                    style={{ gridTemplateColumns: GRID }}
                  >
                    <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => toggleExpanded(o.id)}>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${isOpen ? "rotate-90" : ""}`} strokeWidth={2} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] font-semibold text-ink-900">{o.customerName ?? "Walk-in / unlinked"}</span>
                        <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400" title={summary}>{summary}</span>
                      </span>
                    </button>
                    <div className="text-right font-mono text-[13px] text-ink-700">{o.itemCount.toLocaleString("en-IN")}</div>
                    <div className="text-right font-mono text-[13px] text-ink-700">{o.quantity.toLocaleString("en-IN")}</div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-[13px] font-semibold text-ink-900">{formatMoney(o.revenue, currency)}</span>
                      {o.listSubtotal > o.revenue + 0.005 && (
                        <span className="font-mono text-[10px] text-ink-400" title={`List ${formatMoney(o.listSubtotal, currency)} · discounts ${formatMoney(o.lineDiscountTotal + o.orderDiscount, currency)}`}>
                          <span className="line-through">{formatMoney(o.listSubtotal, currency)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-600">
                      {o.channel ? (
                        <>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHANNEL_DOT[o.channel] }} />
                          {CHANNEL_LABEL[o.channel]}
                        </>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </div>
                    <div className="font-mono text-[12px] text-ink-500">{formatDate(o.soldAt)}</div>
                    <div className="flex justify-end gap-1.5">
                      {editable && (
                        <>
                          <button type="button" className="icon-btn" title="Edit" onClick={() => openSaleEdit(o)}>
                            <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                          </button>
                          <ConfirmDialog
                            action={deleteOrder.bind(null, o.id)}
                            heading={`Delete this sale?`}
                            body={`${o.itemCount} product${o.itemCount > 1 ? "s" : ""} on ${formatDate(o.soldAt)}. This can't be undone.`}
                            confirmLabel="Delete"
                            triggerTitle="Delete"
                            triggerClassName="icon-btn icon-btn-danger"
                            onConfirmed={refetch}
                          >
                            <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                          </ConfirmDialog>
                        </>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="bg-ink-50/40 px-[22px] pb-3 pt-1">
                      {o.items.map((it) => (
                        <div key={it.id} className="grid items-center gap-3 py-1.5" style={{ gridTemplateColumns: GRID }}>
                          <div className="flex min-w-0 flex-col pl-6">
                            <span className="truncate text-[13px] font-medium text-ink-800">{it.productName}</span>
                            <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">{it.sku}</span>
                          </div>
                          <div className="text-right font-mono text-[12px] text-ink-500">{it.quantity.toLocaleString("en-IN")} ×</div>
                          <div className="text-right font-mono text-[12px] text-ink-500">
                            {formatMoney(it.unitPrice, currency)}
                            {it.discountType && it.discountValue > 0 && (
                              <span className="ml-1 text-[10px]" style={{ color: "oklch(0.55 0.14 40)" }}>
                                −{it.discountType === "PERCENT" ? `${it.discountValue}%` : formatMoney(it.discountValue, currency)}
                              </span>
                            )}
                          </div>
                          <div className="text-right font-mono text-[12.5px] font-semibold text-ink-800">{formatMoney(it.revenue, currency)}</div>
                          <span />
                          <span />
                          <span />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card flex-1" style={{ padding: "14px 18px" }}>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-500">{label}</div>
      <div
        className="mt-1 font-mono text-[20px] font-bold tracking-[-0.02em]"
        style={{ color: accent ? "oklch(0.46 0.08 168)" : "oklch(0.2 0.01 260)" }}
      >
        {value}
      </div>
    </div>
  );
}
