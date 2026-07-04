import { requireSession, canEdit } from "@/lib/session";
import { redirect } from "next/navigation";
import { Breadcrumbs, Card } from "@/components/ui";
import { CostForm } from "../cost-form";

export default async function NewCostPage() {
  const { role } = await requireSession();
  if (!canEdit(role)) redirect("/costs");

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{ label: "Master Costs", href: "/costs" }, { label: "New cost item" }]} />
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-900">New cost item</h2>
        <CostForm mode="create" />
      </Card>
    </div>
  );
}
