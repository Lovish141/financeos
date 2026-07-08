"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, AlertTriangle, History } from "lucide-react";
import { Drawer, DrawerBody, DrawerCloseButton, DrawerSkeleton } from "@/components/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteProduct, getProductBreakdown, type ProductBreakdown } from "@/server/actions/product-actions";
import { notifyProductsChanged, openProductHistory } from "./product-drawers";
import { HEALTH_COLOR, HEALTH_TINT } from "@/lib/costing";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { categoryColor } from "@/lib/utils";

export function ProductPreviewDrawer({
  open,
  productId,
  onClose,
  onEdit,
  editable,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  editable: boolean;
}) {
  const [data, setData] = useState<ProductBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    let active = true;
    setLoading(true);
    setData(null);
    // Defer past the router transition: a server action invoked *during* a
    // client-side navigation (e.g. a deep link clicked from another page) is
    // dropped by Next and its promise never settles. rAF fires it after commit.
    const raf = requestAnimationFrame(() => {
      getProductBreakdown(productId).then((res) => {
        if (!active) return;
        setData(res.ok ? (res as ProductBreakdown) : null);
        setLoading(false);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [open, productId]);

  const cat = categoryColor(data?.category);

  return (
    <Drawer open={open} onClose={onClose} width={452}>
      {/* Header */}
      <div className="border-b border-[var(--border)] px-[26px] pb-[18px] pt-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {data && (
              <span
                className="mb-2.5 inline-block max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                style={{ color: cat.color, background: cat.bg }}
                title={`${data.category ?? "Custom"} · ${data.templateName}`}
              >
                {(data.category ?? "Custom")} · {data.templateName}
              </span>
            )}
            <h2 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink-900" title={data?.name}>
              {data?.name ?? (loading ? "Loading…" : "Product")}
            </h2>
            {data && <div className="mt-1 truncate font-mono text-[11px] text-ink-400" title={data.sku}>{data.sku}</div>}
          </div>
          <DrawerCloseButton onClose={onClose} />
        </div>
        {editable && data && (
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => onEdit(data.id)}>
              <Pencil className="h-[14px] w-[14px]" strokeWidth={1.9} /> Edit
            </button>
            <ConfirmDialog
              action={deleteProduct.bind(null, data.id)}
              heading={`Delete ${data.name}?`}
              body="This can't be undone."
              confirmLabel="Delete"
              triggerTitle="Delete"
              triggerClassName="btn-ghost btn-sm text-risk-500"
              onConfirmed={() => {
                onClose();
                notifyProductsChanged();
              }}
            >
              <Trash2 className="h-[14px] w-[14px]" strokeWidth={1.9} /> Delete
            </ConfirmDialog>
          </div>
        )}
      </div>

      <DrawerBody className="px-[26px] py-5">
        {!data ? (
          <DrawerSkeleton />
        ) : (
          <>
            {/* Stat tiles */}
            <div className="mb-[22px] grid grid-cols-3 gap-2.5">
              <StatTile label="Unit cost" value={formatCurrency(data.totalCost, data.currency)} />
              <StatTile label="Selling price" value={formatCurrency(data.sellingPrice, data.currency)} />
              <StatTile
                label="Margin"
                value={formatPercent(data.grossMarginPct)}
                valueColor={HEALTH_COLOR[data.health]}
                bg={HEALTH_TINT[data.health]}
              />
            </div>

            {/* Cost breakdown */}
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">Cost breakdown</span>
              <span className="font-mono text-[10.5px] text-ink-500">{data.lines.length} cost lines</span>
            </div>
            <div className="mb-[22px] flex flex-col">
              {data.lines.map((l, i) => (
                <div key={l.masterCostId} className="flex items-center gap-3 border-b border-[oklch(0.96_0.003_250)] py-[11px] last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[13.5px] font-semibold tracking-[-0.01em] ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`} title={l.name}>
                      {l.name}
                    </div>
                    {l.needsAttention ? (
                      <NeedsAttention archived={l.archived} />
                    ) : (
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400" title={l.detail}>{l.detail}</div>
                    )}
                  </div>
                  <div className="h-[5px] w-[70px] shrink-0 overflow-hidden rounded" style={{ background: "oklch(0.95 0.003 250)" }}>
                    <div
                      className="h-full rounded"
                      style={{ width: `${Math.min(100, l.sharePct)}%`, background: i === 0 ? "oklch(0.5 0.08 172)" : "oklch(0.72 0.02 260)" }}
                    />
                  </div>
                  <div className={`min-w-[66px] shrink-0 whitespace-nowrap text-right font-mono text-[13px] font-semibold ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`} title={formatCurrency(l.lineCost, data.currency)}>
                    {formatCurrency(l.lineCost, data.currency)}
                  </div>
                </div>
              ))}
            </div>

            {/* Gross margin footer */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-[15px] text-white"
              style={{ background: "oklch(0.28 0.02 260)" }}
            >
              <span className="text-[13.5px] font-semibold">Gross margin / unit</span>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-[12px]" style={{ color: "oklch(0.75 0.02 260)" }}>
                  {formatPercent(data.grossMarginPct)}
                </span>
                <span className="font-mono text-[19px] font-bold" style={{ color: "oklch(0.85 0.06 168)" }}>
                  {formatCurrency(data.grossMarginAmount, data.currency)}
                </span>
              </div>
            </div>

            {/* Revision history — opens the full master-detail log. */}
            <button
              type="button"
              onClick={() => openProductHistory(data.id)}
              className="mt-[18px] flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-ink-50/60"
            >
              <span className="flex items-center gap-2.5">
                <History className="h-[15px] w-[15px] text-ink-500" strokeWidth={1.9} />
                <span className="text-[13px] font-semibold text-ink-800">Revision history</span>
              </span>
              <span className="font-mono text-[11px] text-ink-400">View log →</span>
            </button>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

export function NeedsAttention({ archived }: { archived: boolean }) {
  return (
    <div
      className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium"
      style={{ background: "oklch(0.96 0.04 75)", color: "oklch(0.45 0.1 65)" }}
    >
      <AlertTriangle className="h-3 w-3" strokeWidth={2} />
      Needs attention — {archived ? "cost archived" : "cost removed"}
    </div>
  );
}

function StatTile({ label, value, valueColor, bg }: { label: string; value: string; valueColor?: string; bg?: string }) {
  return (
    <div className="min-w-0 rounded-xl px-[14px] py-[13px]" style={{ background: bg ?? "oklch(0.97 0.004 250)" }}>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-500">{label}</div>
      <div className="truncate font-mono text-[17px] font-semibold" style={valueColor ? { color: valueColor } : undefined} title={value}>
        {value}
      </div>
    </div>
  );
}
