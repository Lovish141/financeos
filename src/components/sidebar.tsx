"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Coins,
  Boxes,
  Package,
  FlaskConical,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth-actions";

const groups = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/products", label: "Products", icon: Package },
      { href: "/templates", label: "Templates", icon: Boxes },
      { href: "/costs", label: "Master Costs", icon: Coins },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/simulate", label: "What-If Simulation", icon: FlaskConical, badge: "LIVE" },
    ],
  },
];

/** Design logo mark — a rising line chart (custom, not in lucide). */
function LogoMark() {
  return (
    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[oklch(0.3_0.03_175)]">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="oklch(0.9 0.05 168)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19V5M4 14l5-4 4 3 7-7" />
      </svg>
    </div>
  );
}

export function Sidebar({
  companyName,
  userName,
  userEmail,
  role,
}: {
  companyName: string;
  userName: string | null;
  userEmail: string;
  role: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white">
      <div className="flex items-center gap-3 px-5 pb-[18px] pt-5">
        <LogoMark />
        <div className="min-w-0">
          <div className="text-base font-extrabold tracking-[-0.02em] text-ink-900">FinanceOS</div>
          <div className="truncate font-mono text-[10px] text-ink-400">{companyName}</div>
        </div>
      </div>
      <div className="mx-4 mb-3 h-px bg-ink-100" />

      <nav className="flex-1 space-y-4 overflow-y-auto px-3">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-2 pt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-2.5 py-[9px] text-sm transition-colors",
                      active
                        ? "bg-brand-50 font-semibold text-brand-700"
                        : "font-medium text-ink-600 hover:bg-ink-100",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px]",
                        active ? "text-brand-600" : "text-ink-400",
                      )}
                      strokeWidth={1.9}
                    />
                    {item.label}
                    {"badge" in item && item.badge && (
                      <span className="ml-auto rounded-full bg-brand-100 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.08em] text-brand-700">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-[10px] px-2.5 py-[9px] text-sm transition-colors",
            isActive("/settings")
              ? "bg-brand-50 font-semibold text-brand-700"
              : "font-medium text-ink-600 hover:bg-ink-100",
          )}
        >
          <Settings
            className={cn("h-[18px] w-[18px]", isActive("/settings") ? "text-brand-600" : "text-ink-400")}
            strokeWidth={1.9}
          />
          Settings
        </Link>
        <div className="mt-1.5 flex items-center gap-3 rounded-xl px-2.5 py-[9px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[oklch(0.3_0.03_175)] text-sm font-bold text-[oklch(0.92_0.05_168)]">
            {(userName ?? userEmail).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-bold tracking-[-0.01em] text-ink-900">
              {userName ?? "User"}
            </div>
            <div className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">
              {role.replace("_", " ")}
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.9} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
