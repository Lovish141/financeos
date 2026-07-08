"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerCloseButton, DrawerSkeleton } from "@/components/drawer";
import {
  getProductHistory,
  type ProductHistoryResult,
  type ProductRevision,
} from "@/server/actions/product-actions";
import { formatCurrency, formatPercent, formatRelativeShort } from "@/lib/utils";

// Per-kind label + colour. Metadata edits are neutral; cost moves borrow the
// price-book palette (reprice blue, archive rust, restore mint).
export const KIND_META: Record<
  ProductRevision["kind"],
  { label: string; verb: (t: string | null) => string; color: string; bg: string }
> = {
  CREATED: { label: "Created", verb: () => "Product created", color: "oklch(0.48 0.08 168)", bg: "oklch(0.955 0.025 168)" },
  METADATA: { label: "Edited", verb: () => "Product details edited", color: "oklch(0.45 0.02 260)", bg: "oklch(0.95 0.004 250)" },
  COST_REPRICED: { label: "Repriced", verb: (t) => `${t ?? "An input"} repriced`, color: "oklch(0.5 0.1 250)", bg: "oklch(0.96 0.03 250)" },
  COST_ARCHIVED: { label: "Input archived", verb: (t) => `${t ?? "An input"} archived`, color: "oklch(0.55 0.14 40)", bg: "oklch(0.96 0.03 40)" },
  COST_RESTORED: { label: "Input restored", verb: (t) => `${t ?? "An input"} restored`, color: "oklch(0.48 0.08 168)", bg: "oklch(0.955 0.025 168)" },
};

const RUST = "oklch(0.55 0.14 40)";
const MINT = "oklch(0.48 0.08 168)";

export function ProductHistoryDrawer({
  open,
  productId,
  onClose,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProductHistoryResult | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open || !productId) return;
    let active = true;
    setData(null);
    setSelected(0);
    // Defer past the router transition (same rationale as the preview drawer).
    const raf = requestAnimationFrame(() => {
      getProductHistory(productId).then((res) => {
        if (!active) return;
        setData(res.ok ? (res as ProductHistoryResult) : null);
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [open, productId]);

  const revisions = data?.revisions ?? [];
  const current = revisions[selected] ?? null;
  const currency = data?.currency ?? "INR";

  return (
    <Drawer open={open} onClose={onClose} width={720}>
      {/* Header */}
      <div className="border-b border-[var(--border)] px-[26px] pb-[16px] pt-[20px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Revision history</div>
            <h2 className="mt-1 truncate text-[20px] font-extrabold tracking-[-0.02em] text-ink-900" title={data?.productName}>
              {data?.productName ?? "Loading…"}
            </h2>
            {data && <div className="mt-0.5 truncate font-mono text-[11px] text-ink-400">{data.sku} · {revisions.length} revision{revisions.length === 1 ? "" : "s"}</div>}
          </div>
          <DrawerCloseButton onClose={onClose} />
        </div>
      </div>

      {/* Master-detail body */}
      {!data ? (
        <div className="flex-1 overflow-y-auto px-[26px] py-5">
          <DrawerSkeleton />
        </div>
      ) : revisions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="text-[13px] text-ink-400">No revisions recorded yet for this product.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Timeline rail */}
          <div className="w-[248px] shrink-0 overflow-y-auto border-r border-[var(--border)] py-3">
            {revisions.map((r, i) => {
              const meta = KIND_META[r.kind];
              const active = i === selected;
              const up = (r.costDelta ?? 0) > 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`flex w-full gap-3 px-4 py-2.5 text-left transition-colors ${active ? "bg-ink-50" : "hover:bg-ink-50/60"}`}
                >
                  <div className="flex flex-col items-center pt-1">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color, boxShadow: active ? `0 0 0 3px ${meta.bg}` : "none" }} />
                    {i < revisions.length - 1 && <span className="my-1 w-px flex-1" style={{ background: "var(--border)" }} />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      {r.costDelta != null && r.costDelta !== 0 && (
                        <span className="font-mono text-[10px] font-semibold" style={{ color: up ? RUST : MINT }}>
                          {up ? "+" : "−"}{formatCurrency(Math.abs(r.costDelta), currency)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">{formatRelativeShort(r.at)}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail pane */}
          <div className="min-w-0 flex-1 overflow-y-auto px-[26px] py-5">
            {current && <RevisionDetail revision={current} currency={currency} />}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function RevisionDetail({ revision, currency }: { revision: ProductRevision; currency: string }) {
  const meta = KIND_META[revision.kind];
  const total = revision.totalCost || 1;
  return (
    <>
      <div className="mb-4">
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: meta.color, background: meta.bg }}>
          {meta.label}
        </span>
        <h3 className="mt-2.5 text-[16px] font-bold tracking-[-0.01em] text-ink-900">{meta.verb(revision.triggerName)}</h3>
        <div className="mt-1 font-mono text-[11px] text-ink-400">{formatRelativeShort(revision.at)} · {revision.by}</div>
      </div>

      {/* Stat tiles */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <Tile label="Unit cost" value={formatCurrency(revision.totalCost, currency)} />
        <Tile label="Selling price" value={formatCurrency(revision.sellingPrice, currency)} />
        <Tile label="Margin" value={formatPercent(revision.grossMarginPct)} />
      </div>

      {/* Breakdown as of then */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">Cost breakdown · as of then</span>
        <span className="font-mono text-[10px] text-ink-400">{revision.lines.length} lines</span>
      </div>
      {revision.lines.length === 0 ? (
        <p className="text-[12px] text-ink-400">No component lines recorded.</p>
      ) : (
        <div className="flex flex-col">
          {revision.lines.map((l, i) => {
            const share = total > 0 ? Math.round((l.lineCost / total) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3 border-b border-[oklch(0.96_0.003_250)] py-[10px] last:border-0">
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-semibold tracking-[-0.01em] ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`} title={l.name}>
                    {l.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">
                    {l.needsAttention ? "Excluded from total" : `${l.quantity}${l.unit ? " " + l.unit : ""} × ${formatCurrency(l.unitCost, currency)}`}
                  </div>
                </div>
                <div className="h-[5px] w-[64px] shrink-0 overflow-hidden rounded" style={{ background: "oklch(0.95 0.003 250)" }}>
                  <div className="h-full rounded" style={{ width: `${Math.min(100, share)}%`, background: i === 0 ? "oklch(0.5 0.08 172)" : "oklch(0.72 0.02 260)" }} />
                </div>
                <div className={`min-w-[64px] shrink-0 text-right font-mono text-[12.5px] font-semibold ${l.needsAttention ? "text-ink-400" : "text-ink-900"}`}>
                  {formatCurrency(l.lineCost, currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Field snapshot */}
      <div className="mt-5 rounded-xl px-4 py-3.5" style={{ background: "oklch(0.97 0.004 250)" }}>
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-500">Product · as saved</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
          <dt className="text-ink-400">Name</dt>
          <dd className="truncate text-right font-medium text-ink-800" title={revision.name}>{revision.name}</dd>
          <dt className="text-ink-400">SKU</dt>
          <dd className="truncate text-right font-mono text-ink-800">{revision.sku}</dd>
          <dt className="text-ink-400">Status</dt>
          <dd className="text-right font-medium text-ink-800">{revision.status[0] + revision.status.slice(1).toLowerCase()}</dd>
        </dl>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl px-[14px] py-[13px]" style={{ background: "oklch(0.97 0.004 250)" }}>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-500">{label}</div>
      <div className="truncate font-mono text-[16px] font-semibold text-ink-900" title={value}>{value}</div>
    </div>
  );
}
