import { redirect } from "next/navigation";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs, Card, EmptyState } from "@/components/ui";
import { getLiveCosts } from "@/server/costing-service";
import type { TemplateSnapshot } from "@/lib/costing";
import { ProductForm } from "../product-form";
import Link from "next/link";
import { Boxes } from "lucide-react";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { db, role, companyId } = await requireSession();
  if (!canEdit(role)) redirect("/products");
  const sp = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, weightUnit: true, marginRedThreshold: true, marginYellowThreshold: true },
  });

  // Templates that have at least one saved version can produce products.
  const templates = await db.template.findMany({
    where: { versions: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      versions: { orderBy: { version: "desc" }, take: 1, select: { snapshot: true } },
    },
  });

  // Precompute fixed-cost total + weight rate per template using live prices.
  const allIds = new Set<string>();
  for (const t of templates) {
    const snap = t.versions[0]?.snapshot as unknown as TemplateSnapshot | undefined;
    snap?.lines.forEach((l) => allIds.add(l.masterCostId));
  }
  const liveCosts = await getLiveCosts(db, [...allIds]);

  const templateInfo = templates.map((t) => {
    const snap = t.versions[0].snapshot as unknown as TemplateSnapshot;
    let fixedTotal = 0;
    let weightRate = 0;
    for (const l of snap.lines) {
      const unit = liveCosts[l.masterCostId] ?? l.unitCostAtSnapshot;
      if (l.lineType === "WEIGHT") weightRate = unit;
      else fixedTotal += unit * (l.quantity ?? 0);
    }
    return { id: t.id, name: t.name, fixedTotal, weightRate };
  });

  if (templateInfo.length === 0) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: "New product" }]} />
        <EmptyState
          icon={<Boxes className="h-10 w-10" />}
          title="No usable templates"
          description="Create a template and save its recipe first — products are built from templates."
          action={<Link href="/templates/new" className="btn-primary">Create a template</Link>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: "New product" }]} />
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">New product</h2>
        <p className="mb-4 text-sm text-ink-500">Pick a template, enter the brass weight and selling price — cost and margin compute automatically.</p>
        <ProductForm
          mode="create"
          templates={templateInfo}
          preselectTemplateId={sp.template}
          currency={company?.baseCurrency ?? "INR"}
          weightUnit={company?.weightUnit ?? "kg"}
          thresholds={{
            marginRedThreshold: company?.marginRedThreshold ?? 15,
            marginYellowThreshold: company?.marginYellowThreshold ?? 30,
          }}
        />
      </Card>
    </div>
  );
}
