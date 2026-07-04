"use client";

import { useState } from "react";
import Link from "next/link";
import { Boxes, Package } from "lucide-react";
import type { MasterCostImpact } from "@/server/actions/cost-actions";

// Initially render at most this many rows per group; the rest collapse into a
// "+N more" toggle so a cost used in hundreds of places stays light and
// scrollable, while still being expandable on demand.
const MAX_ROWS = 50;

/**
 * Impact panel shared by the archive confirm dialog in both the costs table and
 * the cost preview drawer — the actual templates and products that reference a
 * cost, not just a count. Each list scrolls independently so a cost used in
 * dozens of places stays readable.
 */
export function CostImpact({ impact }: { impact: MasterCostImpact }) {
  const { templates, products } = impact;

  if (templates.length === 0 && products.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--border)] bg-ink-50/50 px-3.5 py-3 text-[12.5px] text-ink-500">
        Not referenced by any template or product — archiving affects nothing else.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ImpactGroup
        icon={<Boxes className="h-3.5 w-3.5" />}
        label="Templates"
        count={templates.length}
        items={templates}
        href={(t) => `/templates?preview=${t.id}`}
      />
      <ImpactGroup
        icon={<Package className="h-3.5 w-3.5" />}
        label="Products"
        count={products.length}
        items={products}
        href={(p) => `/products/${p.id}`}
      />
    </div>
  );
}

function ImpactGroup({
  icon,
  label,
  count,
  items,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  items: { id: string; name: string }[];
  href: (item: { id: string; name: string }) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (count === 0) return null;
  const shown = expanded ? items : items.slice(0, MAX_ROWS);
  const hidden = count - shown.length;
  return (
    <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-ink-50/60 px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
        <span className="ml-auto rounded-full bg-ink-200/70 px-2 py-0.5 text-[10px] font-semibold text-ink-600">{count}</span>
      </div>
      <div className="max-h-[168px] overflow-y-auto">
        {shown.map((item) => (
          <Link
            key={item.id}
            href={href(item)}
            className="block truncate border-b border-[var(--border)] px-3.5 py-2 text-[13px] font-medium text-ink-800 last:border-0 hover:bg-ink-50/70"
          >
            {item.name}
          </Link>
        ))}
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="block w-full px-3.5 py-2 text-left text-[12px] font-semibold text-brand-600 hover:bg-ink-50/70"
          >
            {expanded ? "Show less" : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}
