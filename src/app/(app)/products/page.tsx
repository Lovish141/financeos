import Link from "next/link";
import { Plus, Package, Search, Pencil, Trash2 } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { formatMoney, formatPercent } from "@/lib/utils";
import { deleteProduct } from "@/server/actions/product-actions";
import type { Prisma, ProductStatus } from "@prisma/client";

const GRID = "2.1fr 1.1fr 0.9fr 0.9fr 1.2fr 74px";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "DISCONTINUED", label: "Discontinued" },
];

function hrefWith(base: string, sp: Record<string, string | undefined>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const { db, role, companyId } = await requireSession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, marginRedThreshold: true, marginYellowThreshold: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };

  const where: Prisma.ProductWhereInput = {};
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { sku: { contains: sp.q, mode: "insensitive" } }];
  if (sp.status && sp.status !== "") where.status = sp.status as ProductStatus;

  const products = await db.product.findMany({
    where,
    orderBy: { grossMarginPct: "desc" },
    include: { template: { select: { name: true } } },
  });

  const editable = canEdit(role);
  const activeStatus = sp.status ?? "";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="SKU catalog"
        title="Products"
        description="Every sellable item, with live cost and margin from the price book."
        action={editable && <Link href="/products/new" className="btn-primary"><Plus className="h-4 w-4" /> New product</Link>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={hrefWith("/products", sp, { status: t.value })}
            className={`seg ${activeStatus === t.value ? "seg-on" : "seg-off"}`}
          >
            {t.label}
          </Link>
        ))}
        <form method="get" className="search-box ml-auto w-[240px]">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
          <input name="q" defaultValue={sp.q} placeholder="Search products" />
        </form>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="No products in this view"
          description="Create a SKU from a template — just enter the brass weight and selling price."
          action={editable && <Link href="/products/new" className="btn-primary"><Plus className="h-4 w-4" /> New product</Link>}
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <div
            className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <span>Product</span>
            <span>Template</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Price</span>
            <span className="text-right">Margin</span>
            <span />
          </div>

          {products.map((p) => {
            const health = marginHealth(p.grossMarginPct, thresholds);
            const color = HEALTH_COLOR[health];
            const barW = `${Math.min(100, (Math.max(0, p.grossMarginPct) / 70) * 100).toFixed(0)}%`;
            return (
              <div
                key={p.id}
                className="grid items-center gap-3 border-b border-[var(--border)] px-[22px] py-[15px] transition-colors last:border-0 hover:bg-ink-50/60"
                style={{ gridTemplateColumns: GRID }}
              >
                <Link href={`/products/${p.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-ink-900">{p.name}</span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-ink-400">
                      {p.sku}
                      {p.status !== "ACTIVE" && ` · ${p.status.toLowerCase()}`}
                    </span>
                  </span>
                </Link>
                <div className="truncate text-[12.5px] font-medium text-ink-600">{p.template.name}</div>
                <div className="text-right font-mono text-[13px] text-ink-600">{formatMoney(p.totalCost, currency)}</div>
                <div className="text-right font-mono text-[13px] font-semibold text-ink-800">{formatMoney(p.sellingPrice, currency)}</div>
                <div className="flex flex-col items-end gap-[5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-400">{formatMoney(p.grossMarginAmount, currency)}</span>
                    <span className="font-mono text-[13.5px] font-bold" style={{ color }}>{formatPercent(p.grossMarginPct)}</span>
                  </div>
                  <div style={{ width: 96, height: 5, borderRadius: 4, background: "oklch(0.94 0.004 250)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: barW, background: color, borderRadius: 4 }} />
                  </div>
                </div>
                <div className="flex justify-end gap-1.5">
                  {editable && (
                    <Link href={`/products/${p.id}/edit`} className="icon-btn" title="Edit">
                      <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </Link>
                  )}
                  {editable && (
                    <ConfirmDialog
                      action={deleteProduct.bind(null, p.id)}
                      heading={`Delete ${p.name}?`}
                      body="This can't be undone."
                      confirmLabel="Delete"
                      triggerTitle="Delete"
                      triggerClassName="icon-btn icon-btn-danger"
                    >
                      <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </ConfirmDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
