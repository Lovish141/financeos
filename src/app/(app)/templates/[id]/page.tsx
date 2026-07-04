import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs, Card, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { TemplateEditor } from "./template-editor";
import { TemplateActions } from "./template-actions-ui";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, role, companyId } = await requireSession();

  const template = await db.template.findFirst({
    where: { id },
    include: {
      components: { orderBy: { sortOrder: "asc" } },
      versions: { orderBy: { version: "desc" }, select: { id: true, version: true, createdAt: true } },
      _count: { select: { products: true } },
    },
  });
  if (!template) notFound();

  const [masterCosts, company] = await Promise.all([
    db.masterCost.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true, weightUnit: true } }),
  ]);

  const editable = canEdit(role);

  return (
    <div>
      <div className="flex items-start justify-between">
        <Breadcrumbs items={[{ label: "Templates", href: "/templates" }, { label: template.name }]} />
        {editable && <TemplateActions id={template.id} name={template.name} productCount={template._count.products} />}
      </div>

      <TemplateEditor
        templateId={template.id}
        initialName={template.name}
        initialCategory={template.category ?? ""}
        initialLines={template.components.map((c) => ({
          masterCostId: c.masterCostId,
          lineType: c.lineType,
          quantity: c.quantity,
        }))}
        masterCosts={masterCosts}
        currency={company?.baseCurrency ?? "INR"}
        weightUnit={company?.weightUnit ?? "kg"}
        editable={editable}
      />

      <Card className="mt-6 p-0">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">Version history</h3>
          <p className="text-xs text-ink-500">Each save snapshots the recipe. Products pin to a specific version.</p>
        </div>
        {template.versions.length === 0 ? (
          <div className="px-5 py-6 text-sm text-ink-500">No versions saved yet — save the recipe to create v1.</div>
        ) : (
          <div>
            {template.versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">v{v.version}</Badge>
                  <span className="text-sm text-ink-600">{formatDate(v.createdAt)}</span>
                </div>
                {v.version === template.versions[0].version && <Badge tone="green">Latest</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {template._count.products > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {template._count.products} product{template._count.products > 1 ? "s" : ""} reference this template.{" "}
          <Link href={`/products?template=${template.id}`} className="text-brand-600 hover:underline">View products</Link>
        </p>
      )}
    </div>
  );
}
