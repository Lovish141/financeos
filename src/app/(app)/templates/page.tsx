import Link from "next/link";
import { Plus, Boxes, Search, Pencil, Trash2 } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { formatMoney, formatPercent, categoryColor } from "@/lib/utils";
import { deleteTemplate } from "@/server/actions/template-actions";
import type { Prisma } from "@prisma/client";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireSession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, marginRedThreshold: true, marginYellowThreshold: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  const where: Prisma.TemplateWhereInput = {};
  if (sp.q)
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { category: { contains: sp.q, mode: "insensitive" } },
    ];

  const templates = await db.template.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: { masterCost: { select: { name: true, type: true, currentCost: true } } },
      },
      products: { select: { grossMarginPct: true } },
      _count: { select: { versions: true } },
    },
  });

  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="BOM / recipe builder"
        title="Templates"
        description="Reusable recipes (BOMs) for each product family. Define the structure once; every SKU inherits it."
        action={
          editable && (
            <Link href="/templates/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New template
            </Link>
          )
        }
      />

      <div className="mb-4 flex items-center justify-end">
        <form method="get" className="search-box w-[260px]">
          <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
          <input name="q" defaultValue={sp.q} placeholder="Search templates" />
        </form>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-10 w-10" />}
          title={sp.q ? "No templates match" : "No templates yet"}
          description="Create a recipe like “Basin Mixer” — brass by weight plus fittings, plating, and labour."
          action={editable && <Link href="/templates/new" className="btn-primary"><Plus className="h-4 w-4" /> New template</Link>}
        />
      ) : (
        <div className="grid gap-[14px] lg:grid-cols-2">
          {templates.map((t) => {
            const fixedCost = t.components
              .filter((c) => c.lineType === "FIXED")
              .reduce((sum, c) => sum + (c.quantity ?? 0) * c.masterCost.currentCost, 0);
            const productCount = t.products.length;
            const avgMargin = productCount
              ? t.products.reduce((sum, p) => sum + p.grossMarginPct, 0) / productCount
              : null;
            const marginColor = avgMargin === null ? "oklch(0.34 0.01 260)" : HEALTH_COLOR[marginHealth(avgMargin, thresholds)];
            const cat = categoryColor(t.category);
            const shown = t.components.slice(0, 6);
            const extra = t.components.length - shown.length;

            return (
              <div key={t.id} className="card p-[22px] transition-shadow hover:shadow-card">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/templates/${t.id}`}
                      className="block truncate text-[18px] font-bold tracking-[-0.02em] text-ink-900 hover:text-brand-700"
                    >
                      {t.name}
                    </Link>
                    {t.category && (
                      <span
                        className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.06em]"
                        style={{ color: cat.color, background: cat.bg }}
                      >
                        {t.category}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1.5">
                      <Link href={`/templates/${t.id}`} className="icon-btn" title="Edit">
                        <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </Link>
                      <ConfirmDialog
                        action={deleteTemplate.bind(null, t.id)}
                        heading={`Delete ${t.name}?`}
                        body={
                          productCount > 0
                            ? `This can't be undone. ${productCount} product${productCount > 1 ? "s" : ""} built on it will also be deleted.`
                            : "This can't be undone."
                        }
                        confirmLabel="Delete"
                        triggerTitle="Delete"
                        triggerClassName="icon-btn icon-btn-danger"
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
                      {shown.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-[7px] border px-[9px] py-1 text-[11.5px] font-medium"
                          style={{ background: "oklch(0.965 0.004 250)", borderColor: "oklch(0.93 0.004 250)", color: "oklch(0.4 0.01 260)" }}
                        >
                          {c.masterCost.name}
                        </span>
                      ))}
                      {extra > 0 && (
                        <span className="px-1 py-1 text-[11.5px] font-medium text-ink-400">+{extra} more</span>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-3.5 font-mono text-[11px] text-ink-500">
                  <span>
                    {t.components.length} lines · fixed <b className="font-semibold text-ink-700">{formatMoney(fixedCost, currency)}</b> ·{" "}
                    {productCount} {productCount === 1 ? "SKU" : "SKUs"}
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
    </div>
  );
}
