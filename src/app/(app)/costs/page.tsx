import Link from "next/link";
import { Search, Archive, RotateCcw } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMoney, formatRelativeShort } from "@/lib/utils";
import { archiveMasterCost, restoreMasterCost } from "@/server/actions/cost-actions";
import { CostDrawers, NewCostButton, ImportCostButton, CostRowOpen, CostEditButton } from "./cost-drawer";
import { CostHistoryCell } from "./cost-history-cell";
import type { CostType, Prisma } from "@prisma/client";

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

function hrefWith(base: string, sp: Record<string, string | undefined>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireSession();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const archivedView = sp.archived === "1";

  const where: Prisma.MasterCostWhereInput = { archived: archivedView };
  if (sp.q) where.name = { contains: sp.q, mode: "insensitive" };
  if (sp.type && sp.type !== "") where.type = sp.type as CostType;

  const items = await db.masterCost.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      history: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { usedInComponents: true } },
    },
  });

  const editable = canEdit(role);
  const activeType = sp.type ?? "";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Price book"
        title="Master Costs"
        description="The single source of truth for input pricing — every cost cascades from here."
        action={
          editable && (
            <div className="flex gap-2.5">
              <ImportCostButton />
              <NewCostButton />
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((t) => (
          <Link
            key={t.value}
            href={hrefWith("/costs", sp, { type: t.value })}
            className={`seg ${activeType === t.value ? "seg-on" : "seg-off"}`}
          >
            {t.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <Link
            href={archivedView ? hrefWith("/costs", sp, { archived: "" }) : hrefWith("/costs", sp, { archived: "1" })}
            className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
          >
            {archivedView ? "← Active items" : "View archived"}
          </Link>
          <form method="get" className="search-box w-[240px]">
            {sp.type && <input type="hidden" name="type" value={sp.type} />}
            {archivedView && <input type="hidden" name="archived" value="1" />}
            <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
            <input name="q" defaultValue={sp.q} placeholder="Search cost items" />
          </form>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={archivedView ? "No archived items" : "No cost items yet"}
          description="Add your raw materials, components, and services — or import a price list."
          action={editable && <NewCostButton />}
        />
      ) : (
        <div className="card overflow-hidden p-0">
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
                  <div className="min-w-0">
                    <CostRowOpen id={item.id} className="text-left text-[14px] font-semibold text-ink-900 hover:text-brand-700">
                      {item.name}
                    </CostRowOpen>
                    <span className="ml-2 font-mono text-[10.5px] text-ink-400">{item.unit}</span>
                  </div>
                </div>
                <div className="text-[12.5px] text-ink-600">{TYPE_LABEL[item.type]}</div>
                <div className="text-right font-mono text-[13px] text-ink-400">{formatMoney(prev, currency)}</div>
                <div className="text-right font-mono text-[13px] font-semibold text-ink-800">{formatMoney(item.currentCost, currency)}</div>
                <div className="text-right font-mono text-[12.5px] font-medium" style={{ color: changeColor }}>
                  {sign}
                  {formatMoney(Math.abs(change), currency)}
                  <span className="text-[10.5px] opacity-80"> {change === 0 ? "0.0%" : `${Math.abs(changePct).toFixed(1)}%`}</span>
                </div>
                {historyPoints.length > 0 ? (
                  <CostHistoryCell id={item.id} currency={currency} dot={TYPE_DOT[item.type]} points={historyPoints} />
                ) : (
                  <span className="block text-center text-ink-300">—</span>
                )}
                <div className="flex justify-end gap-1.5">
                  {editable && !archivedView && (
                    <CostEditButton
                      initial={{ id: item.id, name: item.name, category: item.category, type: item.type, unit: item.unit, currentCost: item.currentCost }}
                    />
                  )}
                  {editable && (
                    <ConfirmDialog
                      action={(archivedView ? restoreMasterCost : archiveMasterCost).bind(null, item.id)}
                      heading={archivedView ? `Restore ${item.name}?` : `Archive ${item.name}?`}
                      body={
                        archivedView
                          ? "It will reappear in lists and pickers."
                          : `It will be hidden from lists and pickers.${
                              item._count.usedInComponents > 0
                                ? ` Used in ${item._count.usedInComponents} template${item._count.usedInComponents > 1 ? "s" : ""}.`
                                : ""
                            }`
                      }
                      confirmLabel={archivedView ? "Restore" : "Archive"}
                      tone="neutral"
                      icon={archivedView ? "restore" : "archive"}
                      toastMessage={archivedView ? "Cost item restored" : "Cost item archived"}
                      triggerTitle={archivedView ? "Restore" : "Archive"}
                      triggerClassName={`icon-btn ${archivedView ? "" : "icon-btn-danger"}`}
                    >
                      {archivedView ? <RotateCcw className="h-[15px] w-[15px]" strokeWidth={1.9} /> : <Archive className="h-[15px] w-[15px]" strokeWidth={1.9} />}
                    </ConfirmDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CostDrawers editable={editable} />
    </div>
  );
}
