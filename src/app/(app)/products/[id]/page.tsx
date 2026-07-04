import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Scale, Boxes } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs, Card, Badge, StatCard } from "@/components/ui";
import { MarginPill } from "@/components/margin-pill";
import { computeProductCost, marginHealth, type TemplateSnapshot } from "@/lib/costing";
import { getLiveCosts } from "@/server/costing-service";
import { formatCurrency } from "@/lib/utils";
import { ProductActions } from "./product-actions-ui";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, role, companyId } = await requireSession();

  const product = await db.product.findFirst({
    where: { id },
    include: { template: { select: { id: true, name: true } }, templateVersion: { select: { version: true, snapshot: true } } },
  });
  if (!product) notFound();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, weightUnit: true, marginRedThreshold: true, marginYellowThreshold: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const weightUnit = company?.weightUnit ?? "kg";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  const snapshot = product.templateVersion.snapshot as unknown as TemplateSnapshot;
  const liveCosts = await getLiveCosts(db, snapshot.lines.map((l) => l.masterCostId));

  // Cost today (live prices) vs cost as of creation (snapshot prices).
  const today = computeProductCost({ brassWeight: product.brassWeight, sellingPrice: product.sellingPrice, snapshot, liveCosts });
  const asCreated = computeProductCost({ brassWeight: product.brassWeight, sellingPrice: product.sellingPrice, snapshot });

  const health = marginHealth(today.grossMarginPct, thresholds);
  const drift = today.totalCost - asCreated.totalCost;
  const editable = canEdit(role);

  return (
    <div>
      <div className="flex items-start justify-between">
        <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: product.name }]} />
        {editable && (
          <div className="flex gap-2">
            <Link href={`/products/${product.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>
            <ProductActions id={product.id} name={product.name} />
          </div>
        )}
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">{product.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-400">
            <span>{product.sku}</span>·
            <Link href={`/templates/${product.template.id}`} className="hover:text-brand-600">{product.template.name} · v{product.templateVersion.version}</Link>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cost" value={formatCurrency(today.totalCost, currency)} sub={`${product.brassWeight} ${weightUnit} brass`} />
        <StatCard label="Selling price" value={formatCurrency(product.sellingPrice, currency)} />
        <StatCard label="Gross margin" value={<span className={today.grossMarginAmount < 0 ? "text-red-600" : ""}>{formatCurrency(today.grossMarginAmount, currency)}</span>} />
        <StatCard label="Margin health" value={<MarginPill health={health} pct={today.grossMarginPct} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-0">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-ink-900">Cost breakdown</h3>
            <p className="text-xs text-ink-500">Every line, priced at today&apos;s master costs.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left font-mono text-[11px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-5 py-2.5 font-medium">Line</th>
                <th className="px-5 py-2.5 text-right font-medium">Unit cost</th>
                <th className="px-5 py-2.5 text-right font-medium">Qty</th>
                <th className="px-5 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {today.lines.map((l) => (
                <tr key={l.masterCostId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded ${l.lineType === "WEIGHT" ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-500"}`}>
                        {l.lineType === "WEIGHT" ? <Scale className="h-3.5 w-3.5" /> : <Boxes className="h-3.5 w-3.5" />}
                      </span>
                      <span className="font-medium text-ink-900">{l.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-ink-600">{formatCurrency(l.unitCost, currency)}<span className="text-xs text-ink-400">/{l.unit}</span></td>
                  <td className="px-5 py-3 text-right text-ink-600">{l.quantity} {l.lineType === "WEIGHT" ? weightUnit : ""}</td>
                  <td className="px-5 py-3 text-right font-medium text-ink-900">{formatCurrency(l.lineCost, currency)}</td>
                </tr>
              ))}
              <tr className="bg-ink-50/60">
                <td className="px-5 py-3 font-semibold text-ink-900" colSpan={3}>Total cost</td>
                <td className="px-5 py-3 text-right font-semibold text-ink-900">{formatCurrency(today.totalCost, currency)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-ink-900">Cost drift</h3>
          <p className="text-xs text-ink-500">How today&apos;s cost compares with the day this SKU was created.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">As created</dt><dd className="font-medium">{formatCurrency(asCreated.totalCost, currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Today</dt><dd className="font-medium">{formatCurrency(today.totalCost, currency)}</dd></div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2">
              <dt className="text-ink-900">Change</dt>
              <dd className={`font-semibold ${drift > 0 ? "text-red-600" : drift < 0 ? "text-emerald-600" : "text-ink-500"}`}>
                {drift > 0 ? "+" : ""}{formatCurrency(drift, currency)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Margin as created</dt><dd className="font-medium">{asCreated.grossMarginPct.toFixed(1)}%</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Margin today</dt><dd><Badge tone={health === "red" ? "red" : health === "yellow" ? "yellow" : "green"}>{today.grossMarginPct.toFixed(1)}%</Badge></dd></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
