import Link from "next/link";
import { Coins, Boxes, Package, Search as SearchIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

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
        <PageHeader eyebrow="Search" title="Search" description="Find any master cost, template, or product across your workspace." />
        <EmptyState icon={<SearchIcon className="h-10 w-10" />} title="Type a query" description="Use the search bar above to look across all three cost layers." />
      </div>
    );
  }

  const [costs, templates, products] = await Promise.all([
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
      where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }] },
      take: 8,
      select: { id: true, name: true, sku: true, grossMarginPct: true },
    }),
  ]);

  const total = costs.length + templates.length + products.length;

  return (
    <div>
      <PageHeader eyebrow="Search" title={`Results for “${query}”`} description={`${total} match${total === 1 ? "" : "es"} across your workspace.`} />

      {total === 0 ? (
        <EmptyState icon={<SearchIcon className="h-10 w-10" />} title="No matches" description="Try a different name or SKU." />
      ) : (
        <div className="space-y-6">
          {costs.length > 0 && (
            <Section title="Master Costs" icon={<Coins className="h-4 w-4" />}>
              {costs.map((c) => (
                <Link key={c.id} href={`/costs/${c.id}`} className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="font-medium text-ink-900">{c.name}</span>
                  <span className="text-sm text-ink-500">{formatCurrency(c.currentCost, currency)}/{c.unit}</span>
                </Link>
              ))}
            </Section>
          )}
          {templates.length > 0 && (
            <Section title="Templates" icon={<Boxes className="h-4 w-4" />}>
              {templates.map((t) => (
                <Link key={t.id} href={`/templates?preview=${t.id}`} className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span className="font-medium text-ink-900">{t.name}</span>
                  {t.category && <Badge tone="brand">{t.category}</Badge>}
                </Link>
              ))}
            </Section>
          )}
          {products.length > 0 && (
            <Section title="Products" icon={<Package className="h-4 w-4" />}>
              {products.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 last:border-0 hover:bg-ink-50/60">
                  <span>
                    <span className="font-medium text-ink-900">{p.name}</span>
                    <span className="ml-2 text-xs text-ink-400">{p.sku}</span>
                  </span>
                  <span className="text-sm text-ink-500">{p.grossMarginPct.toFixed(1)}% margin</span>
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
