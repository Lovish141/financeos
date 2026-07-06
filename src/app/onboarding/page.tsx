import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TYPE_LABELS } from "@/lib/csv";
import { formatMoney } from "@/lib/utils";
import { type TemplateSnapshot } from "@/lib/costing";
import { CostDrawers } from "@/app/(app)/costs/cost-drawer";
import { TemplateDrawers } from "@/app/(app)/templates/template-drawers";
import { ProductDrawers } from "@/app/(app)/products/product-drawers";
import { OnboardingFlow, type CostPreview, type TemplatePreview, type TemplateOption } from "./onboarding-flow";

// Type-dot palette — mirrors the price-book browser so the onboarding preview
// colour-codes cost items exactly like the real /costs table.
const TYPE_DOT: Record<CostPreview["type"], string> = {
  RAW_MATERIAL: "oklch(0.58 0.12 45)",
  COMPONENT: "oklch(0.5 0.1 250)",
  SERVICE: "oklch(0.52 0.09 300)",
};

/** Fixed base cost of a template = sum of its FIXED lines (weight materials are
 * priced per product, so they're excluded here). Archived inputs contribute 0. */
function fixedBaseCost(
  components: { lineType: string; quantity: number | null; masterCost: { currentCost: number; archived: boolean } | null }[],
): number {
  return components.reduce((sum, c) => {
    if (c.lineType !== "FIXED" || !c.masterCost || c.masterCost.archived) return sum;
    return sum + (c.quantity ?? 0) * c.masterCost.currentCost;
  }, 0);
}

export default async function OnboardingPage() {
  const { db, role, companyId } = await requireSession();
  const editable = canEdit(role);

  const [
    costs,
    templates,
    products,
    company,
    costRows,
    previewTpl,
    templateRows,
    drawerMasterCosts,
    productMasterCosts,
    productTemplateRows,
  ] = await Promise.all([
    db.masterCost.count({ where: { archived: false } }),
    db.template.count(),
    db.product.count(),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, baseCurrency: true, weightUnit: true },
    }),
    db.masterCost.findMany({
      where: { archived: false },
      take: 6,
      orderBy: { createdAt: "asc" },
      select: { name: true, type: true, currentCost: true },
    }),
    db.template.findFirst({
      orderBy: { createdAt: "asc" },
      include: {
        components: {
          orderBy: { sortOrder: "asc" },
          include: { masterCost: { select: { name: true, currentCost: true, archived: true } } },
        },
      },
    }),
    db.template.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        components: {
          include: { masterCost: { select: { currentCost: true, archived: true } } },
        },
      },
    }),
    // Drawer option data — mirrors the /templates and /products pages so the
    // shared create drawers behave identically when opened from onboarding.
    db.masterCost.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true, archived: true },
    }),
    db.masterCost.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
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
  ]);

  const currency = company?.baseCurrency ?? "INR";
  const weightUnit = company?.weightUnit ?? "kg";

  const costsPreview: CostPreview[] = costRows.map((c) => ({
    name: c.name,
    type: c.type,
    typeLabel: TYPE_LABELS[c.type],
    dot: TYPE_DOT[c.type],
    cost: formatMoney(c.currentCost),
  }));

  const templatePreview: TemplatePreview | null = previewTpl
    ? {
        name: previewTpl.name,
        category: previewTpl.category,
        chips: previewTpl.components.map((c) => c.masterCost?.name ?? "Removed item").slice(0, 8),
        lineCount: previewTpl.components.length,
        fixedCost: formatMoney(fixedBaseCost(previewTpl.components)),
        hasWeight: previewTpl.components.some((c) => c.lineType === "WEIGHT"),
      }
    : null;

  const templateOptions: TemplateOption[] = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    fixedBase: fixedBaseCost(t.components),
  }));

  // Templates usable as a product base (have a saved recipe), with latest lines.
  const templateInfo = productTemplateRows.map((t) => {
    const snap = t.versions[0]?.snapshot as unknown as TemplateSnapshot | undefined;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      lines: (snap?.lines ?? []).map((l) => ({ masterCostId: l.masterCostId, lineType: l.lineType, quantity: l.quantity })),
    };
  });

  return (
    <>
      <OnboardingFlow
        companyName={company?.name ?? "your company"}
        editable={editable}
        counts={{ costs, templates, products }}
        costsPreview={costsPreview}
        costsRest={Math.max(0, costs - costsPreview.length)}
        templatePreview={templatePreview}
        templateOptions={templateOptions}
      />

      {/* Shared create drawers, mounted so onboarding can open them as overlays
          (via their module pub/sub) without navigating away from the wizard. */}
      {editable && (
        <>
          <CostDrawers editable={editable} />
          <TemplateDrawers masterCosts={drawerMasterCosts} currency={currency} weightUnit={weightUnit} editable={editable} />
          <ProductDrawers templates={templateInfo} masterCosts={productMasterCosts} currency={currency} editable={editable} />
        </>
      )}
    </>
  );
}
