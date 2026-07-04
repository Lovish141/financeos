import { notFound, redirect } from "next/navigation";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs, Card } from "@/components/ui";
import { getLiveCosts } from "@/server/costing-service";
import type { TemplateSnapshot } from "@/lib/costing";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, role, companyId } = await requireSession();
  if (!canEdit(role)) redirect(`/products/${id}`);

  const product = await db.product.findFirst({
    where: { id },
    include: { template: { select: { id: true, name: true } }, templateVersion: { select: { snapshot: true } } },
  });
  if (!product) notFound();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, weightUnit: true, marginRedThreshold: true, marginYellowThreshold: true },
  });

  const snapshot = product.templateVersion.snapshot as unknown as TemplateSnapshot;
  const liveCosts = await getLiveCosts(db, snapshot.lines.map((l) => l.masterCostId));
  let fixedTotal = 0;
  let weightRate = 0;
  for (const l of snapshot.lines) {
    const unit = liveCosts[l.masterCostId] ?? l.unitCostAtSnapshot;
    if (l.lineType === "WEIGHT") weightRate = unit;
    else fixedTotal += unit * (l.quantity ?? 0);
  }

  return (
    <div className="max-w-3xl">
      <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: product.name, href: `/products/${product.id}` }, { label: "Edit" }]} />
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Edit product</h2>
        <p className="mb-4 text-sm text-ink-500">Uses {product.template.name}. Changing weight or price recomputes cost and margin instantly.</p>
        <ProductForm
          mode="edit"
          templates={[{ id: product.template.id, name: product.template.name, fixedTotal, weightRate }]}
          currency={company?.baseCurrency ?? "INR"}
          weightUnit={company?.weightUnit ?? "kg"}
          thresholds={{
            marginRedThreshold: company?.marginRedThreshold ?? 15,
            marginYellowThreshold: company?.marginYellowThreshold ?? 30,
          }}
          initial={{
            id: product.id,
            name: product.name,
            brassWeight: product.brassWeight,
            sellingPrice: product.sellingPrice,
            status: product.status,
          }}
        />
      </Card>
    </div>
  );
}
