import { notFound } from "next/navigation";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs, Card, Badge } from "@/components/ui";
import { CostForm } from "../cost-form";
import { ArchiveButton } from "./archive-button";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function CostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, role, companyId } = await requireSession();

  const item = await db.masterCost.findFirst({
    where: { id },
    include: {
      history: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true, email: true } } },
      },
      usedInComponents: { select: { templateId: true }, distinct: ["templateId"] },
    },
  });
  if (!item) notFound();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const editable = canEdit(role);
  const usedInTemplates = item.usedInComponents.length;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Master Costs", href: "/costs" }, { label: item.name }]} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {editable ? (
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink-900">Edit cost item</h2>
                {item.archived && <Badge tone="yellow">Archived</Badge>}
              </div>
              <CostForm
                mode="edit"
                initial={{
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  type: item.type,
                  unit: item.unit,
                  currentCost: item.currentCost,
                }}
              />
            </Card>
          ) : (
            <Card>
              <h2 className="text-lg font-semibold text-ink-900">{item.name}</h2>
              <p className="mt-1 text-2xl font-semibold">
                {formatCurrency(item.currentCost, currency)}
                <span className="text-sm text-ink-400"> /{item.unit}</span>
              </p>
            </Card>
          )}

          {editable && (
            <Card className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-ink-900">
                  {item.archived ? "Restore this item" : "Archive this item"}
                </div>
                <div className="text-xs text-ink-500">
                  {usedInTemplates > 0
                    ? `Used in ${usedInTemplates} template${usedInTemplates > 1 ? "s" : ""}.`
                    : "Not used in any template."}
                </div>
              </div>
              <ArchiveButton id={item.id} name={item.name} archived={item.archived} usedInTemplates={usedInTemplates} />
            </Card>
          )}
        </div>

        <Card className="p-0">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-ink-900">Price history</h3>
            <p className="text-xs text-ink-500">Every change is recorded — never overwritten.</p>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {item.history.map((h) => {
              const diff = h.oldValue != null ? h.newValue - h.oldValue : null;
              return (
                <div key={h.id} className="flex items-start justify-between border-b border-[var(--border)] px-5 py-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-ink-900">
                      {formatCurrency(h.newValue, currency)}
                      {h.oldValue != null && (
                        <span className="ml-1 text-xs text-ink-400 line-through">
                          {formatCurrency(h.oldValue, currency)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-400">
                      {h.changedBy?.name ?? h.changedBy?.email ?? "System"} · {formatDate(h.createdAt)}
                    </div>
                  </div>
                  {diff != null && diff !== 0 && (
                    <Badge tone={diff > 0 ? "red" : "green"}>
                      {diff > 0 ? "+" : ""}
                      {formatCurrency(diff, currency)}
                    </Badge>
                  )}
                  {h.oldValue == null && <Badge tone="blue">Initial</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
