"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Archive, RotateCcw, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMoney, formatPercent, formatRelativeShort } from "@/lib/utils";
import {
  archiveMasterCost,
  restoreMasterCost,
  searchMasterCosts,
  getMasterCostImpact,
  type MasterCostListItem,
} from "@/server/actions/cost-actions";
import { CostRowOpen, CostEditButton, NewCostButton, onCostsChanged } from "./cost-drawer";
import { CostImpact } from "./cost-impact";
import { CostHistoryCell } from "./cost-history-cell";
import type { CostType } from "@prisma/client";

const GRID = "1.9fr 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 74px";

const TYPE_LABEL: Record<CostType, string> = {
  RAW_MATERIAL: "Raw material",
  COMPONENT: "Component",
  SERVICE: "Service",
};
const TYPE_DOT: Record<CostType, string> = {
  RAW_MATERIAL: "oklch(0.58 0.12 45)",
  COMPONENT: "oklch(0.5 0.1 250)",
  SERVICE: "oklch(0.52 0.09 300)",
};

const TYPE_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "RAW_MATERIAL", label: "Raw material" },
  { value: "COMPONENT", label: "Component" },
  { value: "SERVICE", label: "Service" },
];

export function CostBrowser({
  initialItems,
  currency,
  editable,
  initialType,
  initialQuery,
  initialArchived,
}: {
  initialItems: MasterCostListItem[];
  currency: string;
  editable: boolean;
  initialType: string;
  initialQuery: string;
  initialArchived: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [archived, setArchived] = useState(initialArchived);
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const firstRender = useRef(true);
  const reqId = useRef(0);

  // Debounced live fetch on query/type/archived change. The first render is
  // skipped — its data is already server-rendered from the URL params.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchMasterCosts({ q, type, archived });
      if (id === reqId.current) {
        setItems(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, type, archived]);

  // Keep the URL in sync shallowly (no RSC refetch) so the view is shareable
  // and survives a manual reload.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (archived) params.set("archived", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/costs?${qs}` : "/costs");
  }, [q, type, archived]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchMasterCosts({ q, type, archived });
    if (id === reqId.current) setItems(rows);
  }

  // Refetch when a drawer create/edit/archive/restore/import mutates the price
  // book. Re-subscribes on filter change so the fetch uses the current filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onCostsChanged(refetch), [q, type, archived]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`seg ${type === t.value ? "seg-on" : "seg-off"}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
          >
            {archived ? "← Active items" : "View archived"}
          </button>
          <div className="search-box w-[240px]">
            {loading ? (
              <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin text-brand-500" />
            ) : (
              <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
            )}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cost items"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={archived ? "No archived items" : q || type ? "No cost items match your filters" : "No cost items yet"}
          description={
            q || type
              ? "Try a different search term or type filter."
              : "Add your raw materials, components, and services — or import a price list."
          }
          action={editable && !archived && !q && !type && <NewCostButton />}
        />
      ) : (
        <div className={`card overflow-hidden p-0 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
          <div
            className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <span>Item</span>
            <span>Type</span>
            <span className="text-right">Previous</span>
            <span className="text-right">Current</span>
            <span className="text-right">Change</span>
            <span className="text-center">History</span>
            <span />
          </div>

          {items.map((item) => {
            const hist = [...item.history].reverse(); // chronological (oldest → newest of the latest 3)
            const prev = item.history[0]?.oldValue ?? item.currentCost;
            const change = item.currentCost - prev;
            const changePct = prev ? (change / prev) * 100 : 0;
            const changeColor = change > 0 ? "oklch(0.55 0.14 40)" : change < 0 ? "oklch(0.48 0.08 168)" : "oklch(0.62 0.01 260)";
            const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
            const historyPoints = hist.map((h) => ({
              label: formatRelativeShort(h.createdAt),
              value: h.newValue,
              delta: h.oldValue != null ? h.newValue - h.oldValue : null,
              first: h.oldValue == null,
            }));

            return (
              <div
                key={item.id}
                className="grid items-center gap-3 border-b border-[var(--border)] px-[22px] py-[14px] transition-colors last:border-0 hover:bg-ink-50/60"
                style={{ gridTemplateColumns: GRID }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_DOT[item.type] }} />
                  <div className="flex min-w-0 items-baseline">
                    <CostRowOpen id={item.id} title={item.name} className="min-w-0 truncate text-left text-[14px] font-semibold text-ink-900 hover:text-brand-700">
                      {item.name}
                    </CostRowOpen>
                    <span className="ml-2 shrink-0 font-mono text-[10.5px] text-ink-400" title={item.unit}>{item.unit}</span>
                  </div>
                </div>
                <div className="text-[12.5px] text-ink-600">{TYPE_LABEL[item.type]}</div>
                <div className="text-right font-mono text-[13px] text-ink-400">{formatMoney(prev, currency)}</div>
                <div className="text-right font-mono text-[13px] font-semibold text-ink-800">{formatMoney(item.currentCost, currency)}</div>
                <div className="text-right font-mono text-[12.5px] font-medium" style={{ color: changeColor }}>
                  {sign}
                  {formatMoney(Math.abs(change), currency)}
                  <span className="text-[10.5px] opacity-80"> {change === 0 ? "0.0%" : formatPercent(Math.abs(changePct))}</span>
                </div>
                {historyPoints.length > 0 ? (
                  <CostHistoryCell id={item.id} currency={currency} dot={TYPE_DOT[item.type]} points={historyPoints} />
                ) : (
                  <span className="block text-center text-ink-300">—</span>
                )}
                <div className="flex justify-end gap-1.5">
                  {editable && !archived && (
                    <CostEditButton
                      initial={{ id: item.id, name: item.name, category: item.category, type: item.type, unit: item.unit, currentCost: item.currentCost }}
                    />
                  )}
                  {editable && (
                    <ConfirmDialog
                      action={(archived ? restoreMasterCost : archiveMasterCost).bind(null, item.id)}
                      heading={archived ? `Restore ${item.name}?` : `Archive ${item.name}?`}
                      body={
                        archived
                          ? "It will reappear in lists and pickers, and its cost will count again wherever it's referenced."
                          : "It will be hidden from lists and pickers, and its cost will drop out live wherever it's referenced."
                      }
                      detail={archived ? undefined : () => getMasterCostImpact(item.id).then((impact) => <CostImpact impact={impact} />)}
                      wide={!archived}
                      confirmLabel={archived ? "Restore" : "Archive"}
                      tone={archived ? "neutral" : "danger"}
                      icon={archived ? "restore" : "archive"}
                      toastMessage={archived ? "Cost item restored" : "Cost item archived"}
                      onConfirmed={refetch}
                      triggerTitle={archived ? "Restore" : "Archive"}
                      triggerClassName={`icon-btn ${archived ? "" : "icon-btn-danger"}`}
                    >
                      {archived ? <RotateCcw className="h-[15px] w-[15px]" strokeWidth={1.9} /> : <Archive className="h-[15px] w-[15px]" strokeWidth={1.9} />}
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
