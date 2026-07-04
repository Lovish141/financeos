import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { Simulator } from "./simulator";
import Link from "next/link";
import { Coins } from "lucide-react";

export default async function SimulatePage() {
  const { db, companyId, role } = await requireSession();

  const [masterCosts, company] = await Promise.all([
    db.masterCost.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true, simSettings: true } }),
  ]);

  // Persisted preset — the master-cost ids the user last chose to simulate.
  // Filter to ids that still exist (and are active) so a deleted/archived item
  // doesn't linger in the setup.
  const validIds = new Set(masterCosts.map((m) => m.id));
  const savedIds = (Array.isArray(company?.simSettings) ? company!.simSettings : [])
    .filter((v): v is string => typeof v === "string" && validIds.has(v));

  return (
    <div>
      <PageHeader
        eyebrow="What-if engine"
        title="What-If Simulation"
        description="Change one or more input prices hypothetically and instantly see every affected product's new cost and margin. Nothing is saved."
      />
      {masterCosts.length === 0 ? (
        <EmptyState
          icon={<Coins className="h-10 w-10" />}
          title="No cost items to simulate"
          description="Add master costs first, then simulate a price change."
          action={<Link href="/costs/new" className="btn-primary">Add a cost item</Link>}
        />
      ) : (
        <Simulator
          masterCosts={masterCosts}
          currency={company?.baseCurrency ?? "INR"}
          savedIds={savedIds}
          canSave={canEdit(role)}
        />
      )}
    </div>
  );
}
