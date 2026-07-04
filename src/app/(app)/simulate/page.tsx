import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { Simulator } from "./simulator";
import Link from "next/link";
import { Coins } from "lucide-react";

export default async function SimulatePage() {
  const { db, companyId } = await requireSession();

  const [masterCosts, company] = await Promise.all([
    db.masterCost.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="What-if engine"
        title="What-If Simulation"
        description="Change one input price hypothetically and instantly see every affected product's new cost and margin. Nothing is saved."
      />
      {masterCosts.length === 0 ? (
        <EmptyState
          icon={<Coins className="h-10 w-10" />}
          title="No cost items to simulate"
          description="Add master costs first, then simulate a price change."
          action={<Link href="/costs/new" className="btn-primary">Add a cost item</Link>}
        />
      ) : (
        <Simulator masterCosts={masterCosts} currency={company?.baseCurrency ?? "INR"} />
      )}
    </div>
  );
}
