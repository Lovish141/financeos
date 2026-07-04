"use client";

import { useActionState, useEffect } from "react";
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateCompanySettings } from "@/server/actions/settings-actions";
import type { ActionResult } from "@/server/actions/cost-actions";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toaster";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "CNY", "JPY"];

function SettingRow({
  title,
  desc,
  htmlFor,
  children,
}: {
  title: string;
  desc: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] px-[22px] py-[18px] last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <label htmlFor={htmlFor} className="max-w-sm">
        <div className="text-[13.5px] font-semibold text-ink-900">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{desc}</div>
      </label>
      <div className="shrink-0 sm:w-[220px]">{children}</div>
    </div>
  );
}

export function SettingsForm({
  initial,
  disabled,
}: {
  disabled: boolean;
  initial: {
    name: string;
    baseCurrency: string;
    weightUnit: string;
    marginRedThreshold: number;
    marginYellowThreshold: number;
    stalenessDays: number;
  };
}) {
  const [state, action] = useActionState<ActionResult, FormData>(updateCompanySettings, undefined);

  useEffect(() => {
    if (state?.ok) toast("Settings saved");
  }, [state]);

  const currencyOptions = CURRENCIES.includes(initial.baseCurrency)
    ? CURRENCIES
    : [initial.baseCurrency, ...CURRENCIES];

  return (
    <form action={action}>
      <fieldset disabled={disabled}>
        <SettingRow title="Company name" desc="Shown across the workspace and in the top breadcrumb." htmlFor="name">
          <input className="input" id="name" name="name" defaultValue={initial.name} required />
        </SettingRow>

        <SettingRow title="Base currency" desc="Used to format every price and margin figure." htmlFor="baseCurrency">
          <select className="input" id="baseCurrency" name="baseCurrency" defaultValue={initial.baseCurrency}>
            {currencyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow title="Default weight unit" desc="The unit used for the brass-weight line on templates." htmlFor="weightUnit">
          <input className="input" id="weightUnit" name="weightUnit" defaultValue={initial.weightUnit} />
        </SettingRow>

        <SettingRow title="Margin at risk" desc="Products below this gross margin % are flagged red." htmlFor="marginRedThreshold">
          <div className="relative">
            <input className="input pr-8" id="marginRedThreshold" name="marginRedThreshold" type="number" step="0.1" defaultValue={initial.marginRedThreshold} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-400">%</span>
          </div>
        </SettingRow>

        <SettingRow title="Watch threshold" desc="Products below this margin % are flagged yellow." htmlFor="marginYellowThreshold">
          <div className="relative">
            <input className="input pr-8" id="marginYellowThreshold" name="marginYellowThreshold" type="number" step="0.1" defaultValue={initial.marginYellowThreshold} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-400">%</span>
          </div>
        </SettingRow>

        <SettingRow title="Cost staleness" desc="Cost items untouched for longer are marked stale." htmlFor="stalenessDays">
          <div className="relative">
            <input className="input pr-14" id="stalenessDays" name="stalenessDays" type="number" defaultValue={initial.stalenessDays} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-400">days</span>
          </div>
        </SettingRow>

        {(state?.error || state?.ok || !disabled) && (
          <div className="flex items-center justify-between gap-3 px-[22px] py-[16px]">
            <div>
              {state?.error && <p className="text-[13px] text-risk-500">{state.error}</p>}
              {state?.ok && (
                <p className="flex items-center gap-1.5 text-[13px] text-mint-500">
                  <CheckCircle2 className="h-4 w-4" /> Saved.
                </p>
              )}
            </div>
            {!disabled && <SubmitButton pendingText="Saving…">Save settings</SubmitButton>}
          </div>
        )}
      </fieldset>
    </form>
  );
}
