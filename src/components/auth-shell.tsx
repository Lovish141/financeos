import { Check } from "lucide-react";
import type { ReactNode } from "react";

const bullets = [
  "Live costing across every SKU",
  "What-if simulation before you commit",
  "Margin-at-risk alerts, catalog-wide",
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[oklch(0.275_0.03_178)] p-[52px] text-white lg:flex">
        {/* Faint line-chart watermark */}
        <div className="pointer-events-none absolute -bottom-[60px] -right-20 h-[420px] w-[420px] opacity-[0.14]">
          <svg viewBox="0 0 200 200" fill="none" stroke="oklch(0.85 0.1 168)" strokeWidth="1">
            <path d="M10 150 L40 110 L70 125 L100 70 L130 95 L160 40 L190 60" strokeWidth="2" />
            <path d="M10 175 L190 175M10 175 L10 20" />
            <circle cx="100" cy="70" r="4" fill="oklch(0.85 0.1 168)" />
            <circle cx="160" cy="40" r="4" fill="oklch(0.85 0.1 168)" />
          </svg>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-brand-500">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19V5M4 14l5-4 4 3 7-7" />
            </svg>
          </div>
          <span className="text-[19px] font-extrabold tracking-[-0.02em]">FinanceOS</span>
        </div>

        <div className="relative max-w-[400px]">
          <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-[oklch(0.82_0.05_168)]">
            Manufacturing profitability
          </div>
          <h2 className="text-[34px] font-extrabold leading-[1.15] tracking-[-0.03em]">
            See true cost, true margin, and the impact of every price change — instantly.
          </h2>
          <div className="mt-7 flex flex-col gap-3">
            {bullets.map((b) => (
              <div key={b} className="flex items-center gap-[11px] text-[14.5px] text-[oklch(0.9_0.02_175)]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[oklch(0.42_0.06_172)]">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {b}
              </div>
            ))}
          </div>
        </div>

        <div className="relative font-mono text-[11px] text-[oklch(0.72_0.03_175)]">
          Demo tenant · Gupta Brass Fittings Pvt. Ltd.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-auto lg:flex-1">
        <div className="w-full max-w-[352px] animate-fade-up">
          <div className="mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-brand-500 text-white">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19V5M4 14l5-4 4 3 7-7" />
              </svg>
            </div>
          </div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-ink-900">{title}</h1>
          <p className="mt-1.5 text-[14.5px] text-ink-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
