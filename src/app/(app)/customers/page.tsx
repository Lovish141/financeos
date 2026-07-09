import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { searchCustomers } from "@/server/actions/customer-actions";
import { CustomerBrowser } from "./customer-browser";
import { CustomerDrawers, NewCustomerButton } from "./customer-drawers";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const { role, companyId } = await requireSession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const archivedView = sp.archived === "1";

  const initialItems = await searchCustomers({ q: sp.q, archived: archivedView });
  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Customer master"
        title="Customers"
        description="The people and businesses you sell to — link them to sales to see who drives your revenue."
        action={editable && <NewCustomerButton />}
      />

      <CustomerBrowser
        initialItems={initialItems}
        currency={currency}
        editable={editable}
        initialQuery={sp.q ?? ""}
        initialArchived={archivedView}
      />

      <CustomerDrawers editable={editable} />
    </div>
  );
}
