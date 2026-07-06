"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  Package,
  ReceiptText,
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
} from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/utils";
import { loadDemoData } from "@/server/actions/onboarding-actions";
import { openCostCreate, onCostsChanged } from "@/app/(app)/costs/cost-drawer";
import { openTemplateForm, onTemplatesChanged } from "@/app/(app)/templates/template-drawers";
import { openProductForm, onProductsChanged } from "@/app/(app)/products/product-drawers";

const GREEN = "oklch(0.48 0.08 168)";

export interface CostPreview {
  name: string;
  type: "RAW_MATERIAL" | "COMPONENT" | "SERVICE";
  typeLabel: string;
  dot: string;
  cost: string;
}

export interface TemplatePreview {
  name: string;
  category: string | null;
  chips: string[];
  lineCount: number;
  fixedCost: string;
  hasWeight: boolean;
}

export interface TemplateOption {
  id: string;
  name: string;
  fixedBase: number;
}

interface Counts {
  costs: number;
  templates: number;
  products: number;
}

const STEP_LABELS = ["Choose setup", "Price book", "First recipe", "First product"];

export function OnboardingFlow({
  companyName,
  editable,
  counts,
  costsPreview,
  costsRest,
  templatePreview,
  templateOptions,
}: {
  companyName: string;
  editable: boolean;
  counts: Counts;
  costsPreview: CostPreview[];
  costsRest: number;
  templatePreview: TemplatePreview | null;
  templateOptions: TemplateOption[];
}) {
  // A brand-new editable tenant starts on the demo/scratch choice; once the price
  // book has anything (or the user can't edit), we open straight into the review.
  const canChooseSetup = editable && counts.costs === 0;
  const minStep = canChooseSetup ? 0 : 1;

  const [step, setStep] = useState(minStep);

  // Cost/template/product creation runs in the shared drawers, opened as overlays
  // from this wizard. On save each drawer notifies here; refreshing re-fetches the
  // server component so the new item flows into the previews — the user never
  // leaves onboarding.
  const router = useRouter();
  useEffect(() => {
    const unsubs = [onCostsChanged, onTemplatesChanged, onProductsChanged].map((sub) =>
      sub(() => router.refresh()),
    );
    return () => unsubs.forEach((u) => u());
  }, [router]);

  return (
    <div
      className="flex min-h-screen flex-col items-center px-6 pb-12 pt-8"
      style={{ background: "oklch(0.975 0.004 240)" }}
    >
      <div className="w-full max-w-[940px]">
        {/* Standalone header — logo left, step counter + skip right */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]"
              style={{ background: "oklch(0.30 0.03 175)" }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="oklch(0.9 0.05 168)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V5M4 14l5-4 4 3 7-7" />
              </svg>
            </span>
            <span className="text-[16px] font-extrabold tracking-[-0.02em] text-ink-900">FinanceOS</span>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="font-mono text-[11px] text-ink-500">STEP {step + 1} OF 4</span>
            <Link href="/dashboard" className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-700">
              Skip setup
            </Link>
          </div>
        </div>

        {/* Card: rail + content */}
        <div
          className="grid grid-cols-1 overflow-hidden rounded-3xl border border-[var(--border)] bg-white md:min-h-[520px] md:grid-cols-[260px_1fr]"
          style={{ boxShadow: "0 4px 24px oklch(0.3 0.02 260 / 0.05)" }}
        >
          <Rail step={step} companyName={companyName} />

          {/* Content column */}
          <div className="flex flex-col p-7 sm:p-10">
            <div className="flex-1">
              <div key={step} className="animate-fade-up">
                {step === 0 && <StepChoose />}
                {step === 1 && (
                  <StepPriceBook
                    editable={editable}
                    count={counts.costs}
                    rows={costsPreview}
                    rest={costsRest}
                  />
                )}
                {step === 2 && <StepRecipe editable={editable} template={templatePreview} />}
                {step === 3 && (
                  <StepProduct editable={editable} options={templateOptions} count={counts.products} />
                )}
              </div>
            </div>

            <Footer
              step={step}
              minStep={minStep}
              canChooseSetup={canChooseSetup}
              onBack={() => setStep((s) => Math.max(minStep, s - 1))}
              onNext={() => setStep((s) => Math.min(3, s + 1))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- rail ---- */

function Rail({ step, companyName }: { step: number; companyName: string }) {
  return (
    <div
      className="border-b border-[var(--border)] p-7 md:border-b-0 md:border-r"
      style={{ background: "oklch(0.985 0.003 250)" }}
    >
      <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Get started</div>
      <div className="flex flex-col gap-1">
        {STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div
              key={label}
              className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors"
              style={{ background: active ? "oklch(0.965 0.016 168)" : "transparent" }}
            >
              <span
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold"
                style={
                  done
                    ? { background: "oklch(0.5 0.09 168)", color: "#fff", borderColor: "oklch(0.5 0.09 168)" }
                    : active
                      ? { background: "#fff", color: "oklch(0.34 0.05 175)", borderColor: "oklch(0.6 0.07 172)" }
                      : { background: "oklch(0.97 0.004 250)", color: "oklch(0.6 0.01 260)", borderColor: "oklch(0.9 0.004 250)" }
                }
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className="text-[13.5px]"
                style={{
                  fontWeight: active ? 700 : 500,
                  color: active ? "oklch(0.3 0.03 175)" : done ? "oklch(0.4 0.01 260)" : "oklch(0.6 0.01 260)",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-6 rounded-xl border p-3.5"
        style={{ background: "oklch(0.965 0.015 168)", borderColor: "oklch(0.9 0.03 168)" }}
      >
        <div className="mb-1 text-[12.5px] font-bold text-brand-800">Need a hand?</div>
        <div className="text-[12px] leading-relaxed" style={{ color: "oklch(0.45 0.02 175)" }}>
          Load the demo tenant to explore a fully-built costing model for {companyName}.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- step 0 ---- */

function StepChoose() {
  const [pending, start] = useTransition();

  return (
    <div>
      <h2 className="mb-2 text-[24px] font-extrabold tracking-[-0.025em] text-ink-900">
        Let&apos;s set up your costing model
      </h2>
      <p className="mb-6 text-[14.5px] text-ink-500">
        Choose how you&apos;d like to begin. You can change everything later.
      </p>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {/* Load demo — the recommended path */}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await loadDemoData(); })}
          className="rounded-[14px] border-[1.5px] p-5 text-left transition-all hover:border-brand-300 disabled:opacity-70"
          style={{ borderColor: "oklch(0.91 0.004 250)", background: "#fff" }}
        >
          <div className="mb-3.5 flex items-center justify-between">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-[11px]"
              style={{ background: "oklch(0.955 0.025 168)", color: "oklch(0.46 0.08 168)" }}
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Boxes className="h-5 w-5" strokeWidth={2} />}
            </span>
            <span
              className="rounded-full px-2 py-[3px] font-mono text-[9px] tracking-[0.08em]"
              style={{ background: "oklch(0.955 0.025 168)", color: "oklch(0.46 0.08 168)" }}
            >
              RECOMMENDED
            </span>
          </div>
          <div className="mb-1 text-[16px] font-bold tracking-[-0.01em] text-ink-900">
            {pending ? "Loading demo…" : "Load demo data"}
          </div>
          <div className="text-[13px] leading-relaxed text-ink-500">
            Gupta Brass Fittings — 13 master costs, 4 templates, 9 products, ready to explore.
          </div>
        </button>

        {/* Start from scratch — continue through the guided steps with an empty book */}
        <div
          className="rounded-[14px] border-[1.5px] p-5"
          style={{ borderColor: "oklch(0.91 0.004 250)", background: "#fff" }}
        >
          <span
            className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-[11px]"
            style={{ background: "oklch(0.96 0.004 250)", color: "oklch(0.45 0.01 260)" }}
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="mb-1 text-[16px] font-bold tracking-[-0.01em] text-ink-900">Start from scratch</div>
          <div className="text-[13px] leading-relaxed text-ink-500">
            Begin with an empty price book and build your catalog step by step. Hit Continue to start.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- step 1 ---- */

function StepPriceBook({
  editable,
  count,
  rows,
  rest,
}: {
  editable: boolean;
  count: number;
  rows: CostPreview[];
  rest: number;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[24px] font-extrabold tracking-[-0.025em] text-ink-900">Your price book</h2>
      <p className="mb-5 text-[14.5px] text-ink-500">
        The single source of truth for input pricing. Every cost cascades from here —{" "}
        {count > 0 ? `${count} items seeded.` : "add your first item to begin."}
      </p>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
          {rows.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-b-0"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.dot }} />
              <span className="flex-1 truncate text-[13.5px] font-semibold text-ink-900">{m.name}</span>
              <span className="font-mono text-[11px] text-ink-500">{m.typeLabel}</span>
              <span className="w-[80px] text-right font-mono text-[13px] font-semibold text-ink-900">{m.cost}</span>
            </div>
          ))}
          {rest > 0 && (
            <div
              className="px-4 py-2.5 font-mono text-[11px] text-ink-500"
              style={{ background: "oklch(0.98 0.003 250)" }}
            >
              + {rest} more items
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptText className="h-6 w-6" strokeWidth={1.9} />}
          title="No cost items yet"
          desc="Record each raw material, component and service once — every recipe reads from it."
          cta={editable ? { label: "Add a cost item", onClick: openCostCreate } : null}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- step 2 ---- */

function StepRecipe({ editable, template }: { editable: boolean; template: TemplatePreview | null }) {
  return (
    <div>
      <h2 className="mb-2 text-[24px] font-extrabold tracking-[-0.025em] text-ink-900">Your first recipe</h2>
      <p className="mb-5 text-[14.5px] text-ink-500">
        Templates define how a product family is built — pick the components, services and materials it
        includes.
      </p>

      {template ? (
        <div className="rounded-[14px] border border-[var(--border)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[18px] font-bold tracking-[-0.02em] text-ink-900">{template.name}</div>
            {template.category && (
              <span
                className="shrink-0 rounded-full px-2.5 py-[3px] font-mono text-[10px]"
                style={{ background: "oklch(0.95 0.02 250)", color: "oklch(0.42 0.05 250)" }}
              >
                {template.category}
              </span>
            )}
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {template.chips.map((ch, i) => (
              <span
                key={i}
                className="rounded-[7px] border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-medium text-ink-600"
                style={{ background: "oklch(0.965 0.004 250)" }}
              >
                {ch}
              </span>
            ))}
          </div>
          <div className="border-t border-ink-100 pt-3.5 font-mono text-[12px] text-ink-500">
            {template.lineCount} lines · fixed cost{" "}
            <b className="text-ink-800">{template.fixedCost}</b>
            {template.hasWeight && " + materials by weight"}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Boxes className="h-6 w-6" strokeWidth={1.9} />}
          title="No templates yet"
          desc="Compose master costs into a reusable bill of materials, then spin off many SKUs from it."
          cta={editable ? { label: "Create a template", onClick: () => openTemplateForm("create", null) } : null}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- step 3 ---- */

function StepProduct({
  editable,
  options,
  count,
}: {
  editable: boolean;
  options: TemplateOption[];
  count: number;
}) {
  const [tplId, setTplId] = useState(options[0]?.id ?? "");
  const selected = options.find((o) => o.id === tplId) ?? options[0];
  const base = selected?.fixedBase ?? 0;
  // Suggest a selling price at ~2× base cost, rounded to a tidy figure.
  const [price, setPrice] = useState(() => String(base > 0 ? Math.round((base * 2) / 50) * 50 : 1000));

  const priceNum = parseFloat(price) || 0;
  const marginRs = priceNum - base;
  const marginPct = priceNum > 0 ? (marginRs / priceNum) * 100 : 0;

  return (
    <div>
      <h2 className="mb-2 text-[24px] font-extrabold tracking-[-0.025em] text-ink-900">
        Create your first product
      </h2>
      <p className="mb-5 text-[14.5px] text-ink-500">
        Pick a template, set the price — margin computes instantly from its recipe.
      </p>

      {options.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-[1fr_230px]">
            <div>
              <label className="label" htmlFor="ob-tpl">Template</label>
              <select
                id="ob-tpl"
                className="input"
                value={tplId}
                onChange={(e) => setTplId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>

              <div className="mt-3.5">
                <label className="label" htmlFor="ob-price">Selling price (₹)</label>
                <input
                  id="ob-price"
                  type="number"
                  step={10}
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
                Illustrative — raw materials priced by weight are added per product in the full builder.
              </p>
            </div>

            {/* Dark live-preview panel — the design's signature margin readout */}
            <div
              className="flex flex-col justify-center rounded-[14px] p-5 text-white"
              style={{ background: "oklch(0.29 0.025 175)" }}
            >
              <div
                className="mb-3.5 font-mono text-[10px] tracking-[0.1em]"
                style={{ color: "oklch(0.82 0.04 168)" }}
              >
                LIVE PREVIEW
              </div>
              <div
                className="mb-2 flex justify-between font-mono text-[12px]"
                style={{ color: "oklch(0.8 0.02 175)" }}
              >
                <span>Base cost</span>
                <span className="text-white">{formatMoney(base)}</span>
              </div>
              <div
                className="mb-4 flex justify-between font-mono text-[12px]"
                style={{ color: "oklch(0.8 0.02 175)" }}
              >
                <span>Margin ₹</span>
                <span className="text-white">{formatMoney(marginRs)}</span>
              </div>
              <div
                className="text-[34px] font-extrabold leading-none tracking-[-0.03em]"
                style={{ color: "oklch(0.85 0.08 168)" }}
              >
                {priceNum > 0 ? formatPercent(marginPct) : "—"}
              </div>
              <div
                className="mt-1.5 font-mono text-[10px] tracking-[0.08em]"
                style={{ color: "oklch(0.75 0.03 175)" }}
              >
                GROSS MARGIN
              </div>
            </div>
          </div>

          {editable && (
            <button
              type="button"
              onClick={() => openProductForm("create", null)}
              className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Open the product builder
              <ArrowRight className="h-[15px] w-[15px]" />
            </button>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Package className="h-6 w-6" strokeWidth={1.9} />}
          title={count > 0 ? "You're all set" : "No templates to build from yet"}
          desc={
            count > 0
              ? "Head into the app to manage your products and watch margins live."
              : "Create a template first, then turn it into a sellable SKU with a price and live margin."
          }
          cta={editable && count === 0 ? { label: "Create a template", onClick: () => openTemplateForm("create", null) } : null}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- shared ---- */

function EmptyState({
  icon,
  title,
  desc,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-ink-300 px-6 py-10 text-center">
      <span
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "oklch(0.97 0.006 250)", color: "oklch(0.5 0.01 260)" }}
      >
        {icon}
      </span>
      <div className="text-[15px] font-bold text-ink-900">{title}</div>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">{desc}</p>
      {cta && (
        <button type="button" onClick={cta.onClick} className="btn-primary btn-sm mt-4">
          <Plus className="h-[15px] w-[15px]" /> {cta.label}
        </button>
      )}
    </div>
  );
}

function Footer({
  step,
  minStep,
  canChooseSetup,
  onBack,
  onNext,
}: {
  step: number;
  minStep: number;
  canChooseSetup: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-5">
      <button
        type="button"
        onClick={onBack}
        disabled={step === minStep}
        className="btn-secondary btn-sm disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowLeft className="h-[15px] w-[15px]" /> Back
      </button>

      {step < 3 ? (
        <button type="button" onClick={onNext} className="btn-primary">
          {/* On the choice step, Continue commits the "start from scratch" path;
              the demo path seeds directly from its card. */}
          {step === 0 && canChooseSetup ? "Continue from scratch" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <Link href="/dashboard" className="btn-brand">
          <Sparkles className="h-4 w-4" /> Enter FinanceOS
        </Link>
      )}
    </div>
  );
}
