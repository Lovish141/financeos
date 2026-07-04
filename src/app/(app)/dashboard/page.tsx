import Link from "next/link";
import { Package } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import { marginHealth, HEALTH_COLOR } from "@/lib/costing";
import { computeProductsLive } from "@/server/costing-service";
import { formatMoney, formatPercent, formatDate } from "@/lib/utils";
import { CategoryChart } from "./category-chart";
import { ExportButton } from "./export-button";

// The design's Settings screen exposes a "Target margin goal"; it is not yet a
// persisted Company field, so we reference the design's default here.
const MARGIN_GOAL_PCT = 55;

const MUTED = "oklch(0.55 0.01 260)";

export default async function DashboardPage() {
  const { db, companyId } = await requireSession();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, marginRedThreshold: true, marginYellowThreshold: true },
  });
  const currency = company?.baseCurrency ?? "INR";
  const thresholds = {
    marginRedThreshold: company?.marginRedThreshold ?? 15,
    marginYellowThreshold: company?.marginYellowThreshold ?? 30,
  };
  const thr = Math.round(thresholds.marginRedThreshold); // margin-at-risk threshold
  const goal = MARGIN_GOAL_PCT;

  const [productRows, masterCount, templateCount] = await Promise.all([
    db.product.findMany({
      where: { status: { not: "DISCONTINUED" } },
      select: {
        id: true, name: true, sku: true, sellingPrice: true, comps: true,
        templateVersion: true,
        template: { select: { name: true, category: true } },
      },
    }),
    db.masterCost.count({ where: { archived: false } }),
    db.template.count(),
  ]);

  // Compute-on-read from the live price book — no cached cost columns.
  const costs = await computeProductsLive(db, productRows);
  const products = productRows.map((p) => {
    const c = costs.get(p.id)!;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      sellingPrice: p.sellingPrice,
      template: p.template,
      totalCost: c.totalCost,
      grossMarginAmount: c.grossMarginAmount,
      grossMarginPct: c.grossMarginPct,
    };
  });

  if (products.length === 0) {
    return (
      <div>
        <DashboardHeader updated={formatDate(new Date())} />
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="No products to report on yet"
          description="Follow the guided setup: add master costs → build a template → create products."
          action={<Link href="/onboarding" className="btn-primary">Start setup</Link>}
        />
      </div>
    );
  }

  const totalSku = products.length;
  const avgMargin = products.reduce((s, p) => s + p.grossMarginPct, 0) / totalSku;
  const sorted = [...products].sort((a, b) => a.grossMarginPct - b.grossMarginPct);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const atRisk = sorted.filter((p) => p.grossMarginPct < thr); // ascending
  const marginVals = products.map((p) => p.grossMarginPct);
  const safeLow = Math.min(...marginVals);
  const safeHigh = Math.max(...marginVals);

  // Category rollups (coloured by the same health model used across the app).
  const byCat = new Map<string, { sum: number; count: number }>();
  for (const p of products) {
    const key = p.template?.category || p.template?.name || "Custom";
    const cur = byCat.get(key) ?? { sum: 0, count: 0 };
    cur.sum += p.grossMarginPct;
    cur.count += 1;
    byCat.set(key, cur);
  }
  const categoryData = [...byCat.entries()]
    .map(([category, { sum, count }]) => {
      const margin = sum / count;
      return { category, margin, count, color: HEALTH_COLOR[marginHealth(margin, thresholds)] };
    })
    .sort((a, b) => b.margin - a.margin);

  const goalDelta = avgMargin - goal;
  const goalDeltaStr = `${goalDelta >= 0 ? "+" : "−"}${Math.abs(goalDelta).toFixed(1)}`;
  const goalDeltaColor = goalDelta >= 0 ? "oklch(0.48 0.08 168)" : "oklch(0.58 0.1 55)";

  const riskAccent = atRisk.length ? "oklch(0.55 0.14 40)" : "oklch(0.5 0.09 168)";
  const riskTintBg = atRisk.length ? "oklch(0.96 0.03 40)" : "oklch(0.955 0.025 168)";

  const bar70 = (pct: number) => `${Math.min(100, Math.max(0, pct) / 70 * 100).toFixed(0)}%`;

  return (
    <div className="animate-fade-up">
      <DashboardHeader updated={formatDate(new Date())} />

      {/* KPI cards */}
      <div className="mb-3.5 grid gap-3.5" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}>
        {/* Average margin */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: MUTED }}>
              AVERAGE MARGIN
            </span>
            <span className="font-mono text-[11px] font-medium" style={{ color: goalDeltaColor }}>
              {goalDeltaStr} vs goal
            </span>
          </div>
          <div className="text-[38px] font-extrabold leading-none" style={{ letterSpacing: "-0.03em" }}>
            {formatPercent(avgMargin)}
          </div>
          <div
            className="relative"
            style={{ height: 8, borderRadius: 5, background: "oklch(0.94 0.004 250)", margin: "16px 0 9px" }}
          >
            <div
              className="absolute inset-0"
              style={{
                width: `${Math.max(0, avgMargin).toFixed(1)}%`,
                background: "linear-gradient(90deg, oklch(0.55 0.09 168), oklch(0.48 0.08 172))",
                borderRadius: 5,
              }}
            />
            <div
              className="absolute"
              style={{ top: -3, bottom: -3, left: `${goal}%`, width: 2, background: "oklch(0.3 0.01 260)", borderRadius: 2 }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10.5px]" style={{ color: MUTED }}>
            <span>across {totalSku} SKUs</span>
            <span>goal {goal}%</span>
          </div>
        </div>

        {/* Products */}
        <KpiCard label="PRODUCTS" value={totalSku} icon={<PackageIcon />}>
          from <b style={{ color: "oklch(0.32 0.01 260)" }}>{templateCount} templates</b>
        </KpiCard>

        {/* Master costs */}
        <KpiCard label="MASTER COSTS" value={masterCount} icon={<LinesIcon />}>
          price-book inputs
        </KpiCard>

        {/* Margin at risk */}
        <div className="card" style={{ padding: "18px 20px", borderTopWidth: 3, borderTopColor: riskAccent }}>
          <div className="mb-3.5 flex items-center gap-2.5">
            <span
              className="flex items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 8, background: riskTintBg, color: riskAccent }}
            >
              <WarnIcon />
            </span>
            <span className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: MUTED }}>
              MARGIN AT RISK
            </span>
          </div>
          <div className="text-[38px] font-extrabold leading-none" style={{ letterSpacing: "-0.03em", color: riskAccent }}>
            {atRisk.length}
          </div>
          <div className="mt-3.5 font-mono text-[10.5px]" style={{ color: MUTED }}>
            below {thr}% threshold
          </div>
        </div>
      </div>

      {/* Best / worst */}
      <div className="mb-3.5 grid grid-cols-2 gap-3.5">
        <PerformerCard
          eyebrow="BEST PERFORMER"
          icon={<TrendUpIcon />}
          href={`/products/${best.id}`}
          name={best.name}
          pct={best.grossMarginPct}
          amount={formatMoney(best.grossMarginAmount, currency)}
          pillColor="oklch(0.46 0.08 168)"
          pillBg="oklch(0.955 0.025 168)"
          barW={bar70(best.grossMarginPct)}
          barGradient="linear-gradient(90deg, oklch(0.58 0.09 168), oklch(0.5 0.08 172))"
        />
        <PerformerCard
          eyebrow="LOWEST MARGIN"
          icon={<TrendDownIcon />}
          href={`/products/${worst.id}`}
          name={worst.name}
          pct={worst.grossMarginPct}
          amount={formatMoney(worst.grossMarginAmount, currency)}
          pillColor="oklch(0.55 0.13 40)"
          pillBg="oklch(0.96 0.03 40)"
          barW={bar70(worst.grossMarginPct)}
          barGradient="linear-gradient(90deg, oklch(0.7 0.12 55), oklch(0.62 0.13 40))"
        />
      </div>

      {/* Chart + at-risk list */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.75fr 1fr" }}>
        <CategoryChart data={categoryData} thr={thr} skuCount={totalSku} />

        <div className="card flex flex-col" style={{ padding: "20px 22px" }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-base font-bold tracking-[-0.01em] text-ink-900">Margin at risk</span>
            <span
              className="flex items-center justify-center font-mono text-[12px] font-semibold text-white"
              style={{ background: riskAccent, minWidth: 24, height: 24, padding: "0 7px", borderRadius: 20 }}
            >
              {atRisk.length}
            </span>
          </div>

          {atRisk.length > 0 ? (
            <>
              <div className="flex flex-1 flex-col gap-[9px]">
                {atRisk.map((r) => (
                  <Link
                    key={r.id}
                    href={`/products/${r.id}`}
                    className="flex items-center gap-3"
                    style={{
                      padding: "12px 13px",
                      borderRadius: 11,
                      background: "oklch(0.98 0.008 40)",
                      border: "1px solid oklch(0.92 0.02 40)",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold tracking-[-0.01em] text-ink-900">{r.name}</div>
                      <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: MUTED }}>
                        {r.template?.category || r.template?.name || "Custom"} · {formatMoney(r.grossMarginAmount, currency)}/unit
                      </div>
                    </div>
                    <div className="font-mono text-[15px] font-semibold" style={{ color: "oklch(0.55 0.13 40)" }}>
                      {formatPercent(r.grossMarginPct)}
                    </div>
                  </Link>
                ))}
              </div>
              <div
                className="mt-3.5 flex justify-between border-t pt-[13px] font-mono text-[10.5px]"
                style={{ borderColor: "oklch(0.94 0.003 250)", color: MUTED }}
              >
                <span>SAFE RANGE</span>
                <span className="font-semibold" style={{ color: "oklch(0.34 0.01 260)" }}>
                  {formatPercent(safeLow)} – {formatPercent(safeHigh)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div
                className="flex items-center justify-center"
                style={{ width: 56, height: 56, borderRadius: "50%", background: "oklch(0.55 0.09 168)" }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div className="max-w-[180px] text-[15px] font-semibold text-ink-900">
                Every SKU is priced above your {thr}% floor
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardHeader({ updated }: { updated: string }) {
  return (
    <div className="mb-[22px] flex items-end justify-between gap-5">
      <div>
        <div className="mb-2 font-mono text-[11px] tracking-[0.14em]" style={{ color: "oklch(0.5 0.06 168)" }}>
          MARGIN OVERVIEW
        </div>
        <h1 className="m-0 text-[29px] font-extrabold tracking-[-0.025em] text-ink-900">Profitability health</h1>
        <p className="mt-[7px] text-[14.5px]" style={{ color: "oklch(0.5 0.01 260)" }}>
          Live view of true cost and margin across every SKU · updated {updated}
        </p>
      </div>
      <ExportButton />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          className="flex items-center justify-center"
          style={{ width: 30, height: 30, borderRadius: 8, background: "oklch(0.96 0.006 250)", color: "oklch(0.45 0.01 260)" }}
        >
          {icon}
        </span>
        <span className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color: MUTED }}>
          {label}
        </span>
      </div>
      <div className="text-[38px] font-extrabold leading-none" style={{ letterSpacing: "-0.03em" }}>
        {value}
      </div>
      <div className="mt-3.5 font-mono text-[10.5px]" style={{ color: MUTED }}>
        {children}
      </div>
    </div>
  );
}

function PerformerCard({
  eyebrow,
  icon,
  href,
  name,
  pct,
  amount,
  pillColor,
  pillBg,
  barW,
  barGradient,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  href: string;
  name: string;
  pct: number;
  amount: string;
  pillColor: string;
  pillBg: string;
  barW: string;
  barGradient: string;
}) {
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div className="mb-[15px] flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10.5px] tracking-[0.12em]" style={{ color: MUTED }}>
          {eyebrow}
        </span>
      </div>
      <Link href={href} className="mb-[13px] block text-[22px] font-bold tracking-[-0.02em] text-ink-900">
        {name}
      </Link>
      <div className="mb-[13px] flex items-baseline gap-3">
        <span
          className="font-mono text-[13px] font-semibold"
          style={{ color: pillColor, background: pillBg, padding: "4px 10px", borderRadius: 7 }}
        >
          {formatPercent(pct)} margin
        </span>
        <span className="font-mono text-[14px]" style={{ color: "oklch(0.35 0.01 260)" }}>
          {amount}
          <span style={{ color: "oklch(0.58 0.01 260)", fontSize: 11 }}> / unit</span>
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 5, background: "oklch(0.94 0.004 250)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: barW, background: barGradient, borderRadius: 5 }} />
      </div>
    </div>
  );
}

/* --- Inline SVGs matched to the design --- */

function PackageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0.09 168)" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
    </svg>
  );
}

function TrendDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.58 0.13 40)" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />
    </svg>
  );
}
