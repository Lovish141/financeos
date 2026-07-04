import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { searchMasterCosts } from "@/server/actions/cost-actions";
import { CostDrawers, NewCostButton, ImportCostButton } from "./cost-drawer";
import { CostBrowser } from "./cost-browser";

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const { role, companyId } = await requireSession();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const archivedView = sp.archived === "1";

  // Initial (server-rendered) list honouring the URL params; live filtering
  // afterwards goes through the same action from the client.
  const initialItems = await searchMasterCosts({ q: sp.q, type: sp.type, archived: archivedView });

  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Price book"
        title="Master Costs"
        description="The single source of truth for input pricing — every cost cascades from here."
        action={
          editable && (
            <div className="flex gap-2.5">
              <ImportCostButton />
              <NewCostButton />
            </div>
          )
        }
      />

      <CostBrowser
        initialItems={initialItems}
        currency={currency}
        editable={editable}
        initialType={sp.type ?? ""}
        initialQuery={sp.q ?? ""}
        initialArchived={archivedView}
      />

      <CostDrawers editable={editable} />
    </div>
  );
}
