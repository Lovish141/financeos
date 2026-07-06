"use client";

import { useEffect, useRef, useState } from "react";
import { Boxes, Search, Trash2, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { formatMoney, formatPercent, categoryColor } from "@/lib/utils";
import { deleteTemplate, searchTemplates, type TemplateListItem } from "@/server/actions/template-actions";
import { NewTemplateButton, TemplateRowOpen, TemplateEditButton, onTemplatesChanged } from "./template-drawers";

interface Thresholds {
  marginRedThreshold: number;
  marginYellowThreshold: number;
}

export function TemplateBrowser({
  initialTemplates,
  currency,
  thresholds,
  editable,
  initialQuery,
}: {
  initialTemplates: TemplateListItem[];
  currency: string;
  thresholds: Thresholds;
  editable: boolean;
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [templates, setTemplates] = useState(initialTemplates);
  const [loading, setLoading] = useState(false);

  const firstRender = useRef(true);
  const reqId = useRef(0);

  // Debounced live fetch on query change (first render is already server-rendered).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchTemplates({ q });
      if (id === reqId.current) {
        setTemplates(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  // Keep URL in sync shallowly for shareable/reloadable state.
  useEffect(() => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    window.history.replaceState(null, "", `/templates${qs}`);
  }, [q]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchTemplates({ q });
    if (id === reqId.current) setTemplates(rows);
  }

  // Refetch when a drawer create/edit/clone/delete mutates the catalog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onTemplatesChanged(refetch), [q]);

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <div className="search-box w-[260px]">
          {loading ? (
            <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin text-brand-500" />
          ) : (
            <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" autoComplete="off" />
        </div>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-10 w-10" />}
          title={q ? "No templates match" : "No templates yet"}
          description="Create a recipe like “Basin Mixer” — brass by weight plus fittings, plating, and labour."
          action={editable && !q && <NewTemplateButton />}
        />
      ) : (
        <div className={`grid gap-[14px] transition-opacity duration-150 lg:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
          {templates.map((t) => {
            const avgMargin = t.avgMargin;
            const marginColor = avgMargin === null ? "oklch(0.34 0.01 260)" : HEALTH_COLOR[marginHealth(avgMargin, thresholds)];
            const cat = categoryColor(t.category);
            const shown = t.componentNames.slice(0, 6);
            const extra = t.componentNames.length - shown.length;

            return (
              <div key={t.id} className="card p-[22px] transition-shadow hover:shadow-card">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <TemplateRowOpen
                      id={t.id}
                      title={t.name}
                      className="block truncate text-left text-[18px] font-bold tracking-[-0.02em] text-ink-900 hover:text-brand-700"
                    >
                      {t.name}
                    </TemplateRowOpen>
                    {t.category && (
                      <span
                        className="mt-1.5 inline-block max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                        style={{ color: cat.color, background: cat.bg }}
                        title={t.category}
                      >
                        {t.category}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1.5">
                      <TemplateEditButton id={t.id} />
                      <ConfirmDialog
                        action={deleteTemplate.bind(null, t.id)}
                        heading={`Delete ${t.name}?`}
                        body={
                          t.productCount > 0
                            ? `This can't be undone. ${t.productCount} product${t.productCount > 1 ? "s" : ""} built on it will also be deleted.`
                            : "This can't be undone."
                        }
                        confirmLabel="Delete"
                        triggerTitle="Delete"
                        triggerClassName="icon-btn icon-btn-danger"
                        onConfirmed={refetch}
                      >
                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </ConfirmDialog>
                    </div>
                  )}
                </div>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  {shown.length === 0 ? (
                    <span className="text-[12.5px] text-ink-400">No lines yet</span>
                  ) : (
                    <>
                      {shown.map((nm, i) => (
                        <span
                          key={i}
                          className="max-w-[180px] truncate rounded-[7px] border px-[9px] py-1 text-[11.5px] font-medium"
                          style={{ background: "oklch(0.965 0.004 250)", borderColor: "oklch(0.93 0.004 250)", color: "oklch(0.4 0.01 260)" }}
                          title={nm}
                        >
                          {nm}
                        </span>
                      ))}
                      {extra > 0 && <span className="px-1 py-1 text-[11.5px] font-medium text-ink-400">+{extra} more</span>}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-3.5 font-mono text-[11px] text-ink-500">
                  <span>
                    {t.lineCount} lines · fixed <b className="font-semibold text-ink-700">{formatMoney(t.fixedCost, currency)}</b> ·{" "}
                    {t.productCount} {t.productCount === 1 ? "SKU" : "SKUs"}
                  </span>
                  <span className="font-semibold" style={{ color: marginColor }}>
                    {avgMargin === null ? "—" : formatPercent(avgMargin)} avg
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
