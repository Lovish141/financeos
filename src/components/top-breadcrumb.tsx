"use client";

import { usePathname } from "next/navigation";

// Maps the active route to the breadcrumb label shown in the design's topbar.
const LABELS: { prefix: string; label: string }[] = [
  { prefix: "/dashboard", label: "Dashboard" },
  { prefix: "/products", label: "Products" },
  { prefix: "/templates", label: "Templates" },
  { prefix: "/costs", label: "Master Costs" },
  { prefix: "/simulate", label: "What-If Simulation" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/onboarding", label: "Getting started" },
  { prefix: "/search", label: "Search" },
];

export function TopBreadcrumb({ company }: { company: string }) {
  const pathname = usePathname();
  const match = LABELS.find((l) => pathname === l.prefix || pathname.startsWith(l.prefix + "/"));

  return (
    <div className="hidden items-center gap-2 font-mono text-[12px] md:flex" style={{ color: "oklch(0.58 0.01 260)" }}>
      <span className="max-w-[180px] truncate">{company}</span>
      <span style={{ color: "oklch(0.8 0.01 260)" }}>/</span>
      <span className="font-medium" style={{ color: "oklch(0.3 0.01 260)" }}>
        {match?.label ?? ""}
      </span>
    </div>
  );
}
