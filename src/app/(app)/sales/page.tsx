import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { searchSales } from "@/server/actions/sales-actions";
import { customerOptions } from "@/server/actions/customer-actions";
import { SalesBrowser } from "./sales-browser";
import { SalesDrawers, NewSaleButton, ImportSalesButton, type ProductOption } from "./sales-drawers";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireSession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true },
  });
  const currency = company?.baseCurrency ?? "INR";

  const [initialItems, productRows, customers] = await Promise.all([
    searchSales({ q: sp.q, channel: sp.channel }),
    db.product.findMany({
      where: { status: { not: "DISCONTINUED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    }),
    customerOptions(),
  ]);

  const products: ProductOption[] = productRows;
  const editable = canEdit(role);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Realized transactions"
        title="Sales"
        description="Every recorded sale, at the price actually realized — the basis for true margin and profit contribution."
        action={
          editable && (
            <div className="flex gap-2.5">
              <ImportSalesButton />
              <NewSaleButton />
            </div>
          )
        }
      />

      <SalesBrowser
        initialItems={initialItems}
        currency={currency}
        editable={editable}
        initialQuery={sp.q ?? ""}
        initialChannel={sp.channel ?? ""}
      />

      <SalesDrawers products={products} customers={customers} />
    </div>
  );
}
