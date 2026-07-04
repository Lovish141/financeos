import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage() {
  const { db, role, companyId } = await requireSession();

  const [costs, templates, products, company] = await Promise.all([
    db.masterCost.count(),
    db.template.count(),
    db.product.count(),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  const editable = canEdit(role);

  return (
    <OnboardingFlow
      counts={{ costs, templates, products }}
      editable={editable}
      showDemo={editable && costs === 0 && templates === 0 && products === 0}
      companyName={company?.name ?? "your company"}
    />
  );
}
