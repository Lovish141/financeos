import Link from "next/link";
import { Coins, Boxes, Package, Check, Sparkles, ArrowRight } from "lucide-react";
import { requireSession, canEdit } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { LoadDemoButton } from "./load-demo-button";

export default async function OnboardingPage() {
  const { db, role } = await requireSession();

  const [costs, templates, products] = await Promise.all([
    db.masterCost.count(),
    db.template.count(),
    db.product.count(),
  ]);

  const steps = [
    { done: costs > 0, icon: Coins, title: "Add master costs", desc: "Record the price of your raw materials, components, and services.", href: "/costs/new", cta: "Add a cost", count: costs, label: "cost items" },
    { done: templates > 0, icon: Boxes, title: "Build a template", desc: "Define a reusable recipe (BOM) for a product family.", href: "/templates/new", cta: "Create a template", count: templates, label: "templates" },
    { done: products > 0, icon: Package, title: "Create a product", desc: "Turn a template into a sellable SKU with weight & price.", href: "/products/new", cta: "Create a product", count: products, label: "products" },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = (completed / steps.length) * 100;
  const editable = canEdit(role);
  const green = "oklch(0.48 0.08 168)";

  return (
    <div className="max-w-3xl animate-fade-up">
      <PageHeader eyebrow="Get started" title="Getting started" description="Three steps to a working costing model. Or explore with realistic demo data." />

      <div className="card mb-6 p-[22px]">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-ink-800">Setup progress</span>
          <span className="font-mono text-[12px] text-ink-500">
            {completed} <span className="text-ink-300">/</span> {steps.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: completed === steps.length ? green : "oklch(0.28 0.02 260)" }}
          />
        </div>
      </div>

      <div className="relative">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const last = i === steps.length - 1;
          return (
            <div key={i} className="relative flex gap-4 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold"
                  style={
                    s.done
                      ? { background: green, color: "white" }
                      : { background: "white", color: "oklch(0.45 0.01 260)", boxShadow: "inset 0 0 0 1.5px var(--border)" }
                  }
                >
                  {s.done ? <Check className="h-[16px] w-[16px]" strokeWidth={2.5} /> : i + 1}
                </span>
                {!last && <span className="mt-1 w-px flex-1" style={{ background: "var(--border)" }} />}
              </div>

              <div className="card mb-0 flex flex-1 items-center gap-4 p-[18px]">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={s.done ? { background: "oklch(0.955 0.025 168)", color: green } : { background: "oklch(0.96 0.02 255)", color: "oklch(0.5 0.14 255)" }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold tracking-[-0.01em] text-ink-900">{s.title}</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-ink-500">{s.desc}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {s.count > 0 && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-400">
                      {s.count} {s.label}
                    </span>
                  )}
                  {editable && (
                    <Link href={s.href} className={s.done ? "btn-secondary" : "btn-primary"}>
                      {s.cta} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editable && costs === 0 && (
        <div className="card mt-6 flex items-center gap-4 border-brand-200 bg-brand-50/40 p-[20px]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold text-ink-900">Explore with demo data</div>
            <div className="mt-0.5 text-[13px] text-ink-600">Load the Gupta Brass Fittings dataset — 13 costs, 4 templates, 9 products — to see the whole app populated instantly.</div>
          </div>
          <LoadDemoButton />
        </div>
      )}
    </div>
  );
}
