import { requireStaff, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { searchRequests } from "@/server/actions/request-actions";
import { RequestsBrowser } from "./requests-browser";
import type { ProductOption } from "../sales/sales-drawers";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireStaff();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";

  const status = sp.status ?? "OPEN";
  const [initialItems, productRows] = await Promise.all([
    searchRequests({ q: sp.q, status }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    }),
  ]);
  const products: ProductOption[] = productRows;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Buyer portal"
        title="Order Requests"
        description="Requests raised by portal buyers. Review, adjust pricing and quantities, then approve to book the sale — or send it back."
      />
      <RequestsBrowser
        initialItems={initialItems}
        products={products}
        currency={currency}
        editable={canEdit(role)}
        initialQuery={sp.q ?? ""}
        initialStatus={status}
      />
    </div>
  );
}
