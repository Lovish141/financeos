import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "card p-5",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-5">
      <div className="animate-fade-up">
        {eyebrow && (
          <div className="mb-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-600">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[1.8rem] font-extrabold leading-tight tracking-[-0.025em] text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card group p-5 transition-all duration-200 hover:shadow-card">
      <div className="flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600",
              accent,
            )}
          >
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="mt-3 text-[1.7rem] font-extrabold tracking-[-0.03em] text-ink-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  gray: "bg-ink-100 text-ink-600",
  green: "bg-mint-50 text-mint-500 ring-1 ring-inset ring-mint-500/15",
  yellow: "bg-watch-50 text-watch-500 ring-1 ring-inset ring-watch-500/15",
  red: "bg-risk-50 text-risk-500 ring-1 ring-inset ring-risk-500/15",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones | string;
  className?: string;
}) {
  return (
    <span className={cn("chip", badgeTones[tone] ?? badgeTones.gray, className)}>{children}</span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex animate-fade-up flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-ink-50 to-white text-ink-400 shadow-soft ring-1 ring-ink-100">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        {description && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-5 flex items-center gap-1 text-sm text-ink-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-200" />}
          {item.href ? (
            <Link href={item.href} className="rounded-md px-1 py-0.5 transition-colors hover:text-ink-900">
              {item.label}
            </Link>
          ) : (
            <span className="px-1 font-medium text-ink-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
