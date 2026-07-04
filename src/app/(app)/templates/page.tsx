import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { searchTemplates } from "@/server/actions/template-actions";
import { TemplateBrowser } from "./template-browser";
import { TemplateDrawers, NewTemplateButton } from "./template-drawers";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; preview?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireSession();

  const [initialTemplates, masterCosts, company] = await Promise.all([
    searchTemplates({ q: sp.q }),
    // Include archived so an existing recipe line that references one can still
    // render (flagged); the form filters archived out of the add-pool.
    db.masterCost.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true, archived: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrency: true, weightUnit: true, marginRedThreshold: true, marginYellowThreshold: true },
    }),
  ]);

  const currency = company?.baseCurrency ?? "INR";
  const weightUnit = company?.weightUnit ?? "kg";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };
  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="BOM / recipe builder"
        title="Templates"
        description="Reusable recipes (BOMs) for each product family. Define the structure once; every SKU inherits it."
        action={editable && <NewTemplateButton />}
      />

      <TemplateBrowser
        initialTemplates={initialTemplates}
        currency={currency}
        thresholds={thresholds}
        editable={editable}
        initialQuery={sp.q ?? ""}
      />

      <TemplateDrawers masterCosts={masterCosts} currency={currency} weightUnit={weightUnit} editable={editable} />
    </div>
  );
}
