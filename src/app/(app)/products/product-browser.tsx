"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Search, Trash2, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { formatMoney, formatPercent } from "@/lib/utils";
import { deleteProduct, searchProducts, type ProductListItem } from "@/server/actions/product-actions";
import { NewProductButton, ProductRowOpen, ProductEditButton, onProductsChanged } from "./product-drawers";
import { ProductHistoryCell } from "./product-history-cell";

const GRID = "1.5fr 0.8fr 0.7fr 0.75fr 0.6fr 0.6fr 0.9fr 0.5fr 0.6fr 0.75fr 64px";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "DISCONTINUED", label: "Discontinued" },
];

interface Thresholds {
  marginRedThreshold: number;
  marginYellowThreshold: number;
}

export function ProductBrowser({
  initialProducts,
  currency,
  thresholds,
  editable,
  initialStatus,
  initialQuery,
}: {
  initialProducts: ProductListItem[];
  currency: string;
  thresholds: Thresholds;
  editable: boolean;
  initialStatus: string;
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);

  const firstRender = useRef(true);
  const reqId = useRef(0);

  // Debounced live fetch on query/status change. The first render is skipped —
  // its data is already server-rendered from the URL params.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchProducts({ q, status });
      if (id === reqId.current) {
        setProducts(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, status]);

  // Keep the URL in sync shallowly (no RSC refetch) so the view is shareable
  // and survives a manual reload.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/products?${qs}` : "/products");
  }, [q, status]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchProducts({ q, status });
    if (id === reqId.current) setProducts(rows);
  }

  // Refetch when a drawer create/edit/delete mutates the catalog. Re-subscribes
  // on q/status change so the fetch always uses the current filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onProductsChanged(refetch), [q, status]);

  const filtered = Boolean(q || status);

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" autoComplete="off" />
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={filtered ? "No products match your filters" : "No products in this view"}
          description={
            filtered
              ? "Try a different search term or status filter."
              : "Create a SKU from a template — pick components and quantities, then set a price."
          }
          action={editable && !filtered && <NewProductButton />}
        />
      ) : (
        <div className={`card overflow-hidden p-0 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
          <div
            className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <span>Product</span>
            <span>Template</span>
            <span>Code</span>
            <span>Series</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Price</span>
            <span className="text-right">Margin</span>
            <span className="text-center">History</span>
            <span className="text-right">Units sold</span>
            <span className="text-right">Total profit</span>
            <span />
          </div>

          {products.map((p) => {
            const health = marginHealth(p.grossMarginPct, thresholds);
            const color = HEALTH_COLOR[health];
            const barW = `${Math.min(100, (Math.max(0, p.grossMarginPct) / 70) * 100).toFixed(0)}%`;
            return (
              <div
                key={p.id}
                className="grid items-center gap-3 border-b border-[var(--border)] px-[22px] py-[15px] transition-colors last:border-0 hover:bg-ink-50/60"
                style={{ gridTemplateColumns: GRID }}
              >
                <ProductRowOpen id={p.id} title={p.name} className="flex min-w-0 items-center gap-3 text-left">
                  <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-ink-900">{p.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-400" title={p.sku}>
                      {p.sku}
                      {p.status !== "ACTIVE" && ` · ${p.status.toLowerCase()}`}
                    </span>
                  </span>
                </ProductRowOpen>
                <div className="truncate text-[12.5px] font-medium text-ink-600" title={p.templateName ?? "Custom"}>{p.templateName ?? "Custom"}</div>
                <div className="truncate font-mono text-[12px] text-ink-600" title={p.productCode ?? undefined}>
                  {p.productCode ?? <span className="text-ink-300">—</span>}
                </div>
                <div className="truncate text-[12.5px] text-ink-600" title={p.seriesName ?? undefined}>
                  {p.seriesName ?? <span className="text-ink-300">—</span>}
                </div>
                <div className="text-right font-mono text-[13px] text-ink-600">{formatMoney(p.totalCost, currency)}</div>
                <div className="text-right font-mono text-[13px] font-semibold text-ink-800">{formatMoney(p.sellingPrice, currency)}</div>
                <div className="flex flex-col items-end gap-[5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-400">{formatMoney(p.grossMarginAmount, currency)}</span>
                    <span className="font-mono text-[13.5px] font-bold" style={{ color }}>{formatPercent(p.grossMarginPct)}</span>
                  </div>
                  <div style={{ width: 96, height: 5, borderRadius: 4, background: "oklch(0.94 0.004 250)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: barW, background: color, borderRadius: 4 }} />
                  </div>
                </div>
                <ProductHistoryCell id={p.id} points={p.costHistory} count={p.revisionCount} />
                <div className="text-right font-mono text-[13px] text-ink-600">
                  {p.unitsSold > 0 ? p.unitsSold.toLocaleString("en-IN") : <span className="text-ink-300">—</span>}
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className="font-mono text-[13px] font-semibold"
                    style={{ color: p.unitsSold === 0 ? "oklch(0.72 0.01 260)" : p.totalProfit >= 0 ? "oklch(0.46 0.08 168)" : "oklch(0.55 0.14 40)" }}
                  >
                    {p.unitsSold > 0 ? formatMoney(p.totalProfit, currency) : "—"}
                  </span>
                  {p.unitsSold > 0 && (
                    <span
                      className="font-mono text-[10px] text-ink-400"
                      title={`Realized (net) margin ${formatPercent(p.realizedMarginPct)} · at list price ${formatPercent(p.listMarginPct)}`}
                    >
                      {formatPercent(p.realizedMarginPct)}
                      {Math.abs(p.listMarginPct - p.realizedMarginPct) >= 0.1 && (
                        <span className="text-ink-300"> · list {formatPercent(p.listMarginPct)}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex justify-end gap-1.5">
                  {editable && <ProductEditButton id={p.id} />}
                  {editable && (
                    <ConfirmDialog
                      action={deleteProduct.bind(null, p.id)}
                      heading={`Delete ${p.name}?`}
                      body="This can't be undone."
                      confirmLabel="Delete"
                      triggerTitle="Delete"
                      triggerClassName="icon-btn icon-btn-danger"
                      onConfirmed={refetch}
                    >
                      <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </ConfirmDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
