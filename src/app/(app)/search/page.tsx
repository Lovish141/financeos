import Link from "next/link";
import { Coins, Boxes, Package, Users, Search as SearchIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { computeProductsLive } from "@/server/costing-service";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { db, companyId } = await requireSession();
  const query = (q ?? "").trim();

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });
  const currency = company?.baseCurrency ?? "INR";

  if (!query) {
    return (
      <div>
        <PageHeader eyebrow="Search" title="Search" description="Find any master cost, template, product, or customer across your workspace." />
        <EmptyState icon={<SearchIcon className="h-10 w-10" />} title="Type a query" description="Use the search bar above to look across costs, templates, products, and customers." />
      </div>
    );
  }

  const [costs, templates, products, customers] = await Promise.all([
    db.masterCost.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 8,
      select: { id: true, name: true, type: true, unit: true, currentCost: true },
    }),
    db.template.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      take: 8,
      select: { id: true, name: true, category: true },
    }),
    db.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { sku: { contains: query, mode: "insensitive" } },
          { productCode: { contains: query, mode: "insensitive" } },
          { seriesName: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: {
        id: true, name: true, sku: true, productCode: true, seriesName: true, sellingPrice: true, comps: true,
        templateVersion: true, template: { select: { name: true, category: true } },
      },
    }),
    db.customer.findMany({
      where: {
        archived: false,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
          { gstin: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 8,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, city: true },
    }),
  ]);

  // Margin resolves live from the price book (no cached column).
  const productCosts = await computeProductsLive(db, products);

  const total = costs.length + templates.length + products.length + customers.length;

  return (
    <div>
      <PageHeader eyebrow="Search" title={`Results for “${query}”`} description={`${total} match${total === 1 ? "" : "es"} across your workspace.`} />

      {total === 0 ? (
        <EmptyState icon={<SearchIcon className="h-10 w-10" />} title="No matches" description="Try a different name, SKU, or customer." />
      ) : (
        <div className="space-y-6">
          {costs.length > 0 && (
            <Section title="Master Costs" icon={<Coins className="h-4 w-4" />}>
              {costs.map((c) => (
                <Link key={c.id} href={`/costs/${c.id}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="min-w-0 truncate font-medium text-ink-900" title={c.name}>{c.name}</span>
                  <span className="shrink-0 text-sm text-ink-500" title={c.unit}>{formatCurrency(c.currentCost, currency)}/{c.unit}</span>
                </Link>
              ))}
            </Section>
          )}
          {templates.length > 0 && (
            <Section title="Templates" icon={<Boxes className="h-4 w-4" />}>
              {templates.map((t) => (
                <Link key={t.id} href={`/templates?preview=${t.id}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="min-w-0 truncate font-medium text-ink-900" title={t.name}>{t.name}</span>
                  {t.category && <span className="shrink-0"><Badge tone="brand">{t.category}</Badge></span>}
                </Link>
              ))}
            </Section>
          )}
          {products.length > 0 && (
            <Section title="Products" icon={<Package className="h-4 w-4" />}>
              {products.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="min-w-0 truncate" title={`${p.name} · ${p.sku}${p.productCode ? " · " + p.productCode : ""}${p.seriesName ? " · " + p.seriesName : ""}`}>
                    <span className="font-medium text-ink-900">{p.name}</span>
                    <span className="ml-2 text-xs text-ink-400">
                      {p.sku}
                      {p.productCode && ` · ${p.productCode}`}
                      {p.seriesName && ` · ${p.seriesName}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-500">{formatPercent(productCosts.get(p.id)?.grossMarginPct ?? 0)} margin</span>
                </Link>
              ))}
            </Section>
          )}
          {customers.length > 0 && (
            <Section title="Customers" icon={<Users className="h-4 w-4" />}>
              {customers.map((c) => (
                <Link key={c.id} href={`/customers?q=${encodeURIComponent(c.name)}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="min-w-0 truncate font-medium text-ink-900" title={c.name}>{c.name}</span>
                  {(c.city || c.email) && <span className="shrink-0 truncate text-sm text-ink-500" title={c.email ?? c.city ?? ""}>{c.city ?? c.email}</span>}
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3 text-sm font-semibold text-ink-900">
        <span className="text-ink-400">{icon}</span>
        {title}
      </div>
      <div>{children}</div>
    </Card>
  );
}
