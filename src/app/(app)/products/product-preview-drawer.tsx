"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Drawer, DrawerBody, DrawerCloseButton, DrawerSkeleton } from "@/components/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteProduct, getProductBreakdown, type ProductBreakdown } from "@/server/actions/product-actions";
import { notifyProductsChanged } from "./product-drawers";
import { HEALTH_COLOR, HEALTH_TINT } from "@/lib/costing";
import { formatCurrency } from "@/lib/utils";
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
    getProductBreakdown(productId).then((res) => {
      if (!active) return;
      setData(res.ok ? (res as ProductBreakdown) : null);
      setLoading(false);
    });
    return () => {
      active = false;
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
                className="mb-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                style={{ color: cat.color, background: cat.bg }}
              >
                {(data.category ?? "Custom")} · {data.templateName}
              </span>
            )}
            <h2 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink-900">
              {data?.name ?? (loading ? "Loading…" : "Product")}
            </h2>
            {data && <div className="mt-1 font-mono text-[11px] text-ink-400">{data.sku}</div>}
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
                value={`${data.grossMarginPct.toFixed(1)}%`}
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
                    <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink-900">{l.name}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-400">{l.detail}</div>
                  </div>
                  <div className="h-[5px] w-[70px] overflow-hidden rounded" style={{ background: "oklch(0.95 0.003 250)" }}>
                    <div
                      className="h-full rounded"
                      style={{ width: `${Math.min(100, l.sharePct)}%`, background: i === 0 ? "oklch(0.5 0.08 172)" : "oklch(0.72 0.02 260)" }}
                    />
                  </div>
                  <div className="w-[66px] text-right font-mono text-[13px] font-semibold text-ink-900">
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
                  {data.grossMarginPct.toFixed(1)}%
                </span>
                <span className="font-mono text-[19px] font-bold" style={{ color: "oklch(0.85 0.06 168)" }}>
                  {formatCurrency(data.grossMarginAmount, data.currency)}
                </span>
              </div>
            </div>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

function StatTile({ label, value, valueColor, bg }: { label: string; value: string; valueColor?: string; bg?: string }) {
  return (
    <div className="rounded-xl px-[14px] py-[13px]" style={{ background: bg ?? "oklch(0.97 0.004 250)" }}>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-500">{label}</div>
      <div className="font-mono text-[17px] font-semibold" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
    </div>
  );
}
