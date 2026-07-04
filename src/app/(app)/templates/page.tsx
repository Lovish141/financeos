import Link from "next/link";
import { Plus, Boxes, Search, Pencil, Trash2 } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { formatMoney, formatPercent } from "@/lib/utils";
import { deleteTemplate } from "@/server/actions/template-actions";
import type { CostType, Prisma } from "@prisma/client";

const TYPE_DOT: Record<CostType, string> = {
  RAW_MATERIAL: "oklch(0.58 0.12 45)",
  COMPONENT: "oklch(0.5 0.1 250)",
  SERVICE: "oklch(0.52 0.09 300)",
};

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
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => {
            const fixedCost = t.components
              .filter((c) => c.lineType === "FIXED")
              .reduce((sum, c) => sum + (c.quantity ?? 0) * c.masterCost.currentCost, 0);
            const productCount = t.products.length;
            const avgMargin = productCount
              ? t.products.reduce((sum, p) => sum + p.grossMarginPct, 0) / productCount
              : null;
            const marginColor = avgMargin === null ? undefined : HEALTH_COLOR[marginHealth(avgMargin, thresholds)];
            const shown = t.components.slice(0, 6);
            const extra = t.components.length - shown.length;

            return (
              <div
                key={t.id}
                className="card flex flex-col p-0 transition-shadow hover:shadow-card"
              >
                <div className="flex items-start justify-between gap-3 px-[22px] pt-[20px]">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Boxes className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/templates/${t.id}`}
                        className="block truncate text-[15px] font-bold tracking-[-0.01em] text-ink-900 hover:text-brand-700"
                      >
                        {t.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        {t.category && (
                          <span className="chip bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">{t.category}</span>
                        )}
                        <span className="font-mono text-[10.5px] text-ink-400">v{t._count.versions}</span>
                      </div>
                    </div>
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

                <div className="flex flex-wrap gap-1.5 px-[22px] py-[16px]">
                  {shown.length === 0 ? (
                    <span className="text-[12.5px] text-ink-400">No lines yet</span>
                  ) : (
                    <>
                      {shown.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50/70 px-2.5 py-1 text-[11.5px] font-medium text-ink-700"
                        >
                          <span
                            className="shrink-0"
                            style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_DOT[c.masterCost.type] }}
                          />
                          {c.masterCost.name}
                        </span>
                      ))}
                      {extra > 0 && (
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-[11.5px] font-medium text-ink-400">
                          +{extra} more
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-4 border-t border-[var(--border)] text-center">
                  <Stat label="Lines" value={String(t.components.length)} />
                  <Stat label="Fixed cost" value={formatMoney(fixedCost, currency)} divider />
                  <Stat label="Products" value={String(productCount)} divider />
                  <Stat
                    label="Avg margin"
                    value={avgMargin === null ? "—" : formatPercent(avgMargin)}
                    valueColor={marginColor}
                    divider
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
  divider,
}: {
  label: string;
  value: string;
  valueColor?: string;
  divider?: boolean;
}) {
  return (
    <div className={`px-2 py-[14px] ${divider ? "border-l border-[var(--border)]" : ""}`}>
      <div className="font-mono text-[14px] font-bold tracking-[-0.01em] text-ink-900" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">{label}</div>
    </div>
  );
}
