import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { type TemplateSnapshot } from "@/lib/costing";
import { searchProducts } from "@/server/actions/product-actions";
import { ProductDrawers, NewProductButton } from "./product-drawers";
import { ProductBrowser } from "./product-browser";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; preview?: string }>;
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

  const [initialProducts, templateRows, masterCosts] = await Promise.all([
    // Initial (server-rendered) list honouring the URL params; live filtering
    // afterwards goes through the same action from the client.
    searchProducts({ q: sp.q, status: sp.status }),
    // Templates usable as a base (have a saved recipe), with their latest lines.
    db.template.findMany({
      where: { versions: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        versions: { orderBy: { version: "desc" }, take: 1, select: { snapshot: true } },
      },
    }),
    db.masterCost.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
  ]);

  const templateInfo = templateRows.map((t) => {
    const snap = t.versions[0]?.snapshot as unknown as TemplateSnapshot | undefined;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      lines: (snap?.lines ?? []).map((l) => ({ masterCostId: l.masterCostId, lineType: l.lineType, quantity: l.quantity })),
    };
  });

  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="SKU catalog"
        title="Products"
        description="Every sellable item, with live cost and margin from the price book."
        action={editable && <NewProductButton />}
      />

      <ProductBrowser
        initialProducts={initialProducts}
        currency={currency}
        thresholds={thresholds}
        editable={editable}
        initialStatus={sp.status ?? ""}
        initialQuery={sp.q ?? ""}
      />

      <ProductDrawers templates={templateInfo} masterCosts={masterCosts} currency={currency} editable={editable} />
    </div>
  );
}
