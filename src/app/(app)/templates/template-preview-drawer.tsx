"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, Copy, Trash2, Scale, Boxes, Loader2, AlertTriangle } from "lucide-react";
import { Drawer, DrawerBody, DrawerCloseButton, DrawerSkeleton } from "@/components/drawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  cloneTemplate,
  deleteTemplate,
  getTemplateDetail,
  type TemplateDetail,
} from "@/server/actions/template-actions";
import { formatCurrency, formatRelativeShort, categoryColor } from "@/lib/utils";
import { toast } from "@/components/toaster";
import { notifyTemplatesChanged } from "./template-drawers";

export function TemplatePreviewDrawer({
  open,
  templateId,
  editable,
  onClose,
  onEdit,
}: {
  open: boolean;
  templateId: string | null;
  editable: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const [data, setData] = useState<TemplateDetail | null>(null);
  const [cloning, startClone] = useTransition();

  useEffect(() => {
    if (!open || !templateId) return;
    let active = true;
    setData(null);
    // Defer past the router transition: a server action invoked *during* a
    // client-side navigation (e.g. a deep link clicked from another page) is
    // dropped by Next and its promise never settles. rAF fires it after commit.
    const raf = requestAnimationFrame(() => {
      getTemplateDetail(templateId).then((res) => {
        if (active) setData(res.ok ? (res as TemplateDetail) : null);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [open, templateId]);

  const cat = categoryColor(data?.category);

  function handleClone() {
    if (!data) return;
    startClone(async () => {
      const res = await cloneTemplate(data.id);
      if (res.ok) {
        toast("Template duplicated");
        notifyTemplatesChanged();
        onClose();
      } else {
        toast(res.error ?? "Could not duplicate");
      }
    });
  }

  return (
    <Drawer open={open} onClose={onClose} width={480}>
      {/* Header */}
      <div className="border-b border-[var(--border)] px-[26px] pb-[18px] pt-[22px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {data?.category && (
              <span
                className="mb-2.5 inline-block max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                style={{ color: cat.color, background: cat.bg }}
                title={data.category}
              >
                {data.category}
              </span>
            )}
            <h2 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink-900" title={data?.name}>
              {data?.name ?? "Loading…"}
            </h2>
            {data && (
              <div className="mt-1 font-mono text-[11px] text-ink-400">
                {data.lines.length} lines · {data.productCount} {data.productCount === 1 ? "SKU" : "SKUs"} ·{" "}
                {data.versions.length} version{data.versions.length === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <DrawerCloseButton onClose={onClose} />
        </div>
        {editable && data && (
          <div className="mt-4 flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => onEdit(data.id)}>
              <Pencil className="h-[14px] w-[14px]" strokeWidth={1.9} /> Edit
            </button>
            <button className="btn-ghost btn-sm" onClick={handleClone} disabled={cloning}>
              {cloning ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Copy className="h-[14px] w-[14px]" strokeWidth={1.9} />}
              Clone
            </button>
            <ConfirmDialog
              action={deleteTemplate.bind(null, data.id)}
              heading={`Delete ${data.name}?`}
              body={
                data.productCount > 0
                  ? `This can't be undone. ${data.productCount} product${data.productCount > 1 ? "s" : ""} built on it will also be deleted.`
                  : "This can't be undone."
              }
              confirmLabel="Delete"
              triggerTitle="Delete"
              triggerClassName="btn-ghost btn-sm text-risk-500"
              onConfirmed={() => {
                onClose();
                notifyTemplatesChanged();
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
            {/* Recipe lines */}
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">Recipe lines</span>
              <span className="font-mono text-[10.5px] text-ink-500">{data.lines.length} lines</span>
            </div>
            {data.lines.length === 0 ? (
              <div className="mb-[22px] rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-[13px] text-ink-400">
                No recipe lines yet.
              </div>
            ) : (
              <div className="mb-[22px] flex flex-col">
                {data.lines.map((l) => {
                  const isWeight = l.lineType === "WEIGHT";
                  return (
                    <div key={l.masterCostId} className="flex items-center gap-3 border-b border-[oklch(0.96_0.003_250)] py-[11px] last:border-0">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isWeight ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-500"}`}>
                        {isWeight ? <Scale className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[13.5px] font-semibold tracking-[-0.01em] ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`} title={l.name}>
                          {l.name}
                        </div>
                        {l.needsAttention ? (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium"
                            style={{ background: "oklch(0.96 0.04 75)", color: "oklch(0.45 0.1 65)" }}
                          >
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                            Needs attention — cost archived
                          </div>
                        ) : (
                          <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">
                            {isWeight
                              ? `${formatCurrency(l.currentCost, data.currency)}/${l.unit} · per ${data.weightUnit}`
                              : `${l.quantity} × ${formatCurrency(l.currentCost, data.currency)}`}
                          </div>
                        )}
                      </div>
                      <div className={`min-w-[70px] shrink-0 whitespace-nowrap text-right font-mono text-[13px] font-semibold ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`}>
                        {l.needsAttention ? formatCurrency(0, data.currency) : isWeight ? `${formatCurrency(l.currentCost, data.currency)}/${data.weightUnit}` : formatCurrency(l.lineCost, data.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cost per product */}
            <div className="mb-[22px] flex items-center justify-between rounded-xl px-4 py-[15px] text-white" style={{ background: "oklch(0.28 0.02 260)" }}>
              <span className="text-[13.5px] font-semibold">Cost per product</span>
              <div className="text-right">
                <span className="font-mono text-[19px] font-bold" style={{ color: "oklch(0.85 0.06 168)" }}>
                  {formatCurrency(data.fixedTotal, data.currency)}
                </span>
                {data.weightRate > 0 && (
                  <span className="ml-1.5 font-mono text-[11px]" style={{ color: "oklch(0.75 0.02 260)" }}>
                    + {formatCurrency(data.weightRate, data.currency)} × wt
                  </span>
                )}
              </div>
            </div>

            {/* Version history */}
            <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">Version history</div>
            {data.versions.length === 0 ? (
              <div className="text-[13px] text-ink-400">No versions yet — save the recipe to snapshot v1.</div>
            ) : (
              <div className="flex flex-col">
                {data.versions.map((v, i) => (
                  <div key={v.version} className="flex items-center justify-between border-b border-[oklch(0.96_0.003_250)] py-2.5 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                        v{v.version}
                      </span>
                      <span className="font-mono text-[11px] text-ink-500">{formatRelativeShort(v.at)}</span>
                    </div>
                    {i === 0 && (
                      <span className="rounded-full bg-mint-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-mint-500 ring-1 ring-inset ring-mint-500/15">
                        Latest
                      </span>
                    )}
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
