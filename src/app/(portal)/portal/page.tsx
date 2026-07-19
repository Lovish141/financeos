import { getCatalog, buyerCurrency } from "@/server/actions/buyer-actions";
import { CatalogOrder } from "./catalog-order";

export default async function CatalogPage() {
  const [catalog, currency] = await Promise.all([getCatalog(), buyerCurrency()]);

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-600">Place an order</div>
        <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-[-0.025em] text-ink-900">Catalog</h1>
        <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
          Add the products and quantities you need, then submit your request. Your supplier confirms
          pricing and approves before it becomes an order.
        </p>
      </div>
      <CatalogOrder catalog={catalog} currency={currency} />
    </div>
  );
}
