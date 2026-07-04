"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Coins,
  Boxes,
  Package,
  Gauge,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { loadDemoData } from "@/server/actions/onboarding-actions";

const GREEN = "oklch(0.48 0.08 168)";

export interface Counts {
  costs: number;
  templates: number;
  products: number;
}

interface Point {
  label: string;
  desc: string;
}

interface Step {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  lede: string;
  points: Point[];
  href: string;
  cta: string;
  railTitle: string;
  railDesc: string;
  done: boolean;
  count: number;
  countLabel: string;
  final?: boolean;
}

function buildSteps(c: Counts): Step[] {
  const ready = c.costs > 0 && c.templates > 0 && c.products > 0;
  return [
    {
      icon: Coins,
      eyebrow: "Step 01 · Price book",
      title: "Add your master costs",
      lede: "Your price book is the single source of truth for what things cost. Record each raw material, component, and outsourced service once — every recipe and product reads from it.",
      points: [
        { label: "Raw materials by weight", desc: "Priced in ₹/kg — brass, zinc, plating." },
        { label: "Components & services", desc: "Priced per piece or per unit of work." },
        { label: "Prices keep their history", desc: "Edit a cost later and the old value is preserved for trend tracking." },
      ],
      href: "/costs?new=1",
      cta: "Add a cost item",
      railTitle: "Master costs",
      railDesc: "Build the price book",
      done: c.costs > 0,
      count: c.costs,
      countLabel: "cost items",
    },
    {
      icon: Boxes,
      eyebrow: "Step 02 · Recipes",
      title: "Build a template",
      lede: "A template is a reusable bill of materials for a product family. Compose costs into a recipe once, then spin off many SKUs from it without repeating yourself.",
      points: [
        { label: "Pick lines, set quantities", desc: "Combine any master costs into a recipe." },
        { label: "Weight vs fixed lines", desc: "Raw materials take a per-product weight; components take a fixed count." },
        { label: "Versioned automatically", desc: "Historical product costs never drift when you edit the recipe." },
      ],
      href: "/templates/new",
      cta: "Create a template",
      railTitle: "Templates",
      railDesc: "Define a reusable BOM",
      done: c.templates > 0,
      count: c.templates,
      countLabel: "templates",
    },
    {
      icon: Package,
      eyebrow: "Step 03 · Products",
      title: "Create a product",
      lede: "Turn a template into a sellable SKU. Set the per-unit weights and a selling price — FinanceOS computes true cost, gross margin, and health the moment you save.",
      points: [
        { label: "Reality at the SKU level", desc: "Per-product weights and quantities live on each line." },
        { label: "Always up to date", desc: "Cost, margin ₹ and margin % recompute on any price change." },
        { label: "Simulate before you commit", desc: "Preview a price change across every affected SKU." },
      ],
      href: "/products?new=1",
      cta: "Create a product",
      railTitle: "Products",
      railDesc: "Turn recipes into SKUs",
      done: c.products > 0,
      count: c.products,
      countLabel: "products",
    },
    {
      icon: Gauge,
      eyebrow: "Step 04 · Monitor",
      title: "Watch your margins",
      lede: "The dashboard is your margin cockpit — average margin against goal, best and worst performers, and every SKU sitting below your risk threshold, colour-coded by health.",
      points: [
        { label: "Health at a glance", desc: "Colour-coded margins across products and categories." },
        { label: "Catch risk early", desc: "At-risk SKUs surface before they quietly cost you." },
        { label: "Share the snapshot", desc: "Export the current margin picture any time." },
      ],
      href: "/dashboard",
      cta: "Go to dashboard",
      railTitle: "Dashboard",
      railDesc: "Monitor margin health",
      done: ready,
      count: 0,
      countLabel: "",
      final: true,
    },
  ];
}

export function OnboardingFlow({
  counts,
  editable,
  showDemo,
  companyName,
}: {
  counts: Counts;
  editable: boolean;
  showDemo: boolean;
  companyName: string;
}) {
  const steps = useMemo(() => buildSteps(counts), [counts]);
  const firstTodo = steps.findIndex((s) => !s.done);
  const [active, setActive] = useState(firstTodo === -1 ? steps.length - 1 : firstTodo);

  const completed = steps.slice(0, 3).filter((s) => s.done).length;
  const pct = (completed / 3) * 100;
  const allDone = completed === 3;

  const step = steps[active];
  const Icon = step.icon;
  const last = active === steps.length - 1;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up pb-4">
      {/* Header — mirrors the dashboard header treatment */}
      <div className="mb-6 flex items-end justify-between gap-5">
        <div>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-600">
            Get started
          </div>
          <h1 className="text-[29px] font-extrabold tracking-[-0.025em] text-ink-900">
            Welcome to FinanceOS
          </h1>
          <p className="mt-[7px] max-w-xl text-[14.5px] leading-relaxed text-ink-500">
            Four steps to a live costing model for {companyName} — price book, recipes, products,
            then your margin dashboard lights up.
          </p>
        </div>
        <Link href="/dashboard" className="btn-secondary btn-sm shrink-0">
          Skip for now
        </Link>
      </div>

      {/* Progress hero */}
      <div className="card mb-4 p-[22px]">
        <div className="mb-3.5 flex items-end justify-between">
          <div>
            <div className="font-mono text-[10.5px] tracking-[0.1em] text-ink-500">SETUP PROGRESS</div>
            <div className="mt-1.5 text-[15px] font-bold tracking-[-0.01em] text-ink-900">
              {allDone ? "You're ready to go" : `${completed} of 3 steps complete`}
            </div>
          </div>
          <div
            className="font-mono text-[30px] font-extrabold leading-none tracking-[-0.03em] transition-colors"
            style={{ color: allDone ? GREEN : "oklch(0.28 0.02 260)" }}
          >
            {Math.round(pct)}%
          </div>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: allDone
                ? `linear-gradient(90deg, oklch(0.55 0.09 168), oklch(0.48 0.08 172))`
                : `linear-gradient(90deg, oklch(0.55 0.09 168), oklch(0.5 0.09 168) 55%, oklch(0.44 0.08 172))`,
            }}
          />
        </div>
      </div>

      {/* Guided stepper: rail + active detail */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_1fr]">
        {/* Rail */}
        <div className="flex flex-col">
          {steps.map((s, i) => {
            const isActive = i === active;
            const isLast = i === steps.length - 1;
            const RailIcon = s.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className="group relative flex animate-fade-up gap-3 pb-2.5 text-left last:pb-0"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold transition-all duration-200"
                    style={
                      s.done
                        ? { background: GREEN, color: "white" }
                        : isActive
                          ? { background: "white", color: "oklch(0.46 0.07 172)", boxShadow: "inset 0 0 0 2px oklch(0.5 0.09 168)" }
                          : { background: "white", color: "oklch(0.5 0.01 260)", boxShadow: "inset 0 0 0 1.5px var(--border)" }
                    }
                  >
                    {s.done ? <Check className="h-[16px] w-[16px]" strokeWidth={2.5} /> : i + 1}
                  </span>
                  {!isLast && <span className="mt-1 w-px flex-1" style={{ background: "var(--border)" }} />}
                </div>

                <div
                  className="mb-0 flex flex-1 items-center gap-3 rounded-2xl border p-[14px] transition-all duration-200"
                  style={
                    isActive
                      ? { borderColor: "oklch(0.89 0.04 170)", background: "oklch(0.97 0.015 168)", boxShadow: "0 1px 3px oklch(0.3 0.02 260 / 0.05), 0 8px 24px -14px oklch(0.3 0.02 260 / 0.14)" }
                      : { borderColor: "var(--border)", background: "white" }
                  }
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
                    style={
                      s.done
                        ? { background: "oklch(0.955 0.025 168)", color: GREEN }
                        : isActive
                          ? { background: "white", color: "oklch(0.46 0.07 172)" }
                          : { background: "oklch(0.96 0.006 250)", color: "oklch(0.5 0.01 260)" }
                    }
                  >
                    <RailIcon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-[-0.01em] text-ink-900">
                      {s.railTitle}
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-dot" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-ink-500">
                      {s.count > 0 ? `${s.count} ${s.countLabel}` : s.railDesc}
                    </div>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-all duration-200"
                    style={{ color: isActive ? "oklch(0.46 0.07 172)" : "oklch(0.82 0.006 250)" }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Active step detail — re-animates on change via key */}
        <div key={active} className="card flex animate-pop flex-col p-[26px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={
                  step.done
                    ? { background: "oklch(0.955 0.025 168)", color: GREEN }
                    : { background: "oklch(0.97 0.015 168)", color: "oklch(0.46 0.07 172)" }
                }
              >
                <Icon className="h-6 w-6" strokeWidth={1.9} />
              </span>
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand-600">
                  {step.eyebrow}
                </div>
                <h2 className="mt-0.5 text-[21px] font-extrabold tracking-[-0.02em] text-ink-900">
                  {step.title}
                </h2>
              </div>
            </div>
            {step.done && (
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                style={{ background: "oklch(0.955 0.025 168)", color: GREEN }}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> Done
              </span>
            )}
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-ink-600">{step.lede}</p>

          <div className="mt-5 flex flex-col gap-3">
            {step.points.map((p, i) => (
              <div
                key={i}
                className="flex animate-fade-up gap-3"
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "oklch(0.955 0.025 168)", color: GREEN }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <div className="text-[13.5px] leading-snug">
                  <span className="font-semibold text-ink-900">{p.label}</span>
                  <span className="text-ink-500"> — {p.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex items-center gap-2.5 border-t border-[var(--border)] pt-5">
            {editable && (
              <Link href={step.href} className={step.final ? "btn-brand" : "btn-primary"}>
                {step.final ? <Sparkles className="h-4 w-4" /> : null}
                {step.cta}
                {!step.final && <ArrowRight className="h-4 w-4" />}
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">
              {active > 0 && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setActive(active - 1)}>
                  <ArrowLeft className="h-[15px] w-[15px]" /> Back
                </button>
              )}
              {!last && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setActive(active + 1)}>
                  Next <ArrowRight className="h-[15px] w-[15px]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Demo shortcut */}
      {showDemo && <DemoCard />}
    </div>
  );
}

function DemoCard() {
  const [pending, start] = useTransition();
  return (
    <div
      className="mt-4 flex animate-fade-up items-center gap-4 overflow-hidden rounded-3xl p-[22px] text-white shadow-glow"
      style={{
        animationDelay: "160ms",
        background:
          "linear-gradient(135deg, oklch(0.55 0.09 168) 0%, oklch(0.5 0.09 168) 55%, oklch(0.44 0.08 172) 100%)",
      }}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
        <Sparkles className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-bold tracking-[-0.01em]">Not sure where to start?</div>
        <div className="mt-0.5 text-[13px] text-white/80">
          Load the Gupta Brass Fittings sample — 13 costs, 4 templates, 9 products — and explore the
          whole app populated instantly.
        </div>
      </div>
      <button
        type="button"
        className="btn inline-flex shrink-0 bg-white/95 font-bold text-brand-700 hover:bg-white disabled:opacity-70"
        disabled={pending}
        onClick={() => start(async () => { await loadDemoData(); })}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "Loading…" : "Load demo data"}
      </button>
    </div>
  );
}
